import { supabaseAdmin } from "@/lib/admin/admin.server";
import { runRemindersCron, type RemindersRunnerResult } from "./reminders-runner.server";

export type CronTriggerSource = "interval" | "request" | "boot" | "manual";

export interface CronRunResult {
  executed: boolean;
  ok?: boolean;
  runId?: string;
  reason?: string;
  created?: number;
  durationMs?: number;
  error?: string;
  otpCleanup?: RemindersRunnerResult["otpCleanup"];
}

// Paramètres temporels de référence
export const FAST_PATH_FRESH_MS = 22 * 60 * 60 * 1000; // 22 heures (batch quotidien)
export const DB_CHECK_MIN_INTERVAL_MS = 60 * 1000; // 60 secondes (anti-saturation DB)
export const LOCK_TIMEOUT_SEC = 900; // 15 minutes (expiration verrou)
export const ANTI_DOUBLE_RUN_MS = 5 * 60 * 1000; // 5 minutes (garde anti-double-exécution)

// État mémoire (par runtime)
let lastKnownSuccessAt: number | null = null;
let lastDbCheckAt = 0;
let isExecutingInMemory = false;

/**
 * Orchestrateur central pour l'exécution sécurisée et résiliente du cron.
 * Coordonne les exécutions déclenchées par intervalle, requête, boot ou appel manuel.
 *
 * Garanties :
 * - Fast-path mémoire évitant les requêtes DB superflues.
 * - Verrouillage distribué PostgreSQL (cron_lock) avec expiration automatique (15 min).
 * - Journalisation complète (cron_runs, system_events).
 * - Libération garantie du verrou dans le bloc finally.
 * - Ne propage jamais d'exception non gérée vers l'appelant.
 */
export async function maybeRunCron(triggeredBy: CronTriggerSource): Promise<CronRunResult> {
  const now = Date.now();

  // 1. Fast path mémoire : déjà en cours d'exécution dans ce runtime
  if (isExecutingInMemory) {
    return {
      executed: false,
      reason: "in_memory_running",
    };
  }

  // 2. Fast path mémoire : déjà exécuté avec succès aujourd'hui (sauf déclenchement manuel)
  if (triggeredBy !== "manual") {
    if (lastKnownSuccessAt !== null && now - lastKnownSuccessAt < FAST_PATH_FRESH_MS) {
      return {
        executed: false,
        reason: "already_run_today_memory",
      };
    }

    // Anti-saturation : limiter les requêtes DB si une vérification a eu lieu très récemment
    if (now - lastDbCheckAt < DB_CHECK_MIN_INTERVAL_MS) {
      return {
        executed: false,
        reason: "throttled_db_check",
      };
    }
  }

  lastDbCheckAt = now;

  // 3. Vérification de la dernière exécution réussie en base de données
  try {
    const { data: latestSuccess, error: checkError } = await supabaseAdmin
      .from("cron_runs" as never)
      .select("started_at" as never)
      .eq("kind" as never, "reminders" as never)
      .eq("status" as never, "success" as never)
      .order("started_at" as never, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.warn(
        "[cron/orchestrator] Erreur lors de la vérification cron_runs :",
        checkError.message,
      );
    } else if (latestSuccess) {
      const row = latestSuccess as unknown as { started_at: string };
      const lastRunMs = new Date(row.started_at).getTime();
      lastKnownSuccessAt = Math.max(lastKnownSuccessAt ?? 0, lastRunMs);

      // Si déjà exécuté dans les 22 dernières heures, on évite une nouvelle exécution automatique
      if (triggeredBy !== "manual" && now - lastRunMs < FAST_PATH_FRESH_MS) {
        return {
          executed: false,
          reason: "already_run_today_db",
        };
      }

      // Garde anti-double-exécution stricte (5 minutes) même en cas d'appels rapprochés
      if (triggeredBy !== "manual" && now - lastRunMs < ANTI_DOUBLE_RUN_MS) {
        return {
          executed: false,
          reason: "anti_double_run_guard",
        };
      }
    }
  } catch (dbCheckEx) {
    console.error("[cron/orchestrator] Exception lors de la vérification en base :", dbCheckEx);
    // On poursuit vers l'acquisition du verrou SQL pour laisser la DB arbitrer
  }

  // 4. Acquisition du verrou distribué (cron_lock)
  const lockedBy = `${triggeredBy}_${crypto.randomUUID()}`;
  let lockAcquired = false;

  try {
    const { data: acquired, error: lockError } = await supabaseAdmin.rpc(
      "acquire_cron_lock" as never,
      {
        _kind: "reminders",
        _locked_by: lockedBy,
        _lock_timeout_sec: LOCK_TIMEOUT_SEC,
      } as never,
    );

    if (lockError) {
      console.error("[cron/orchestrator] Erreur RPC acquire_cron_lock :", lockError.message);
      return {
        executed: false,
        error: `Erreur acquisition verrou : ${lockError.message}`,
      };
    }

    lockAcquired = Boolean(acquired);
  } catch (lockEx) {
    const msg = lockEx instanceof Error ? lockEx.message : String(lockEx);
    console.error("[cron/orchestrator] Exception acquire_cron_lock :", msg);
    return {
      executed: false,
      error: `Exception acquisition verrou : ${msg}`,
    };
  }

  if (!lockAcquired) {
    return {
      executed: false,
      reason: "locked_or_running",
    };
  }

  // 5. Verrou obtenu : exécution orchestrée sous protection try / catch / finally
  isExecutingInMemory = true;
  const runId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // 5.1 Enregistrement immédiat du run à l'état 'running'
    try {
      await supabaseAdmin.from("cron_runs" as never).insert({
        id: runId,
        kind: "reminders",
        triggered_by: triggeredBy,
        started_at: new Date(startTime).toISOString(),
        status: "running",
      } as never);
    } catch (insertRunErr) {
      console.error("[cron/orchestrator] Impossible d'enregistrer le run initial :", insertRunErr);
    }

    // 5.2 Exécution de la logique métier (runner)
    console.info(
      `[cron/orchestrator] Démarrage du cron reminders (déclencheur: ${triggeredBy}, runId: ${runId})`,
    );
    const runnerResult = await runRemindersCron();
    const durationMs = Date.now() - startTime;
    const finishedAt = new Date().toISOString();

    // 5.3 Enregistrement du succès
    try {
      await supabaseAdmin
        .from("cron_runs" as never)
        .update({
          status: "success",
          finished_at: finishedAt,
          duration_ms: durationMs,
          created_count: runnerResult.created,
        } as never)
        .eq("id" as never, runId as never);
    } catch (updateRunErr) {
      console.error("[cron/orchestrator] Erreur mise à jour cron_runs (success) :", updateRunErr);
    }

    // Mise à jour de l'état mémoire de succès uniquement après réussite
    lastKnownSuccessAt = startTime;

    console.info(
      `[cron/orchestrator] Cron reminders terminé avec succès en ${durationMs}ms (${runnerResult.created} rappels)`,
    );

    return {
      executed: true,
      ok: true,
      runId,
      created: runnerResult.created,
      durationMs,
      otpCleanup: runnerResult.otpCleanup,
    };
  } catch (runError: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = runError instanceof Error ? runError.message : String(runError);
    const finishedAt = new Date().toISOString();

    console.error(
      `[cron/orchestrator] Échec de l'exécution du cron (${triggeredBy}) :`,
      errorMessage,
    );

    // 5.4 Enregistrement de l'échec dans cron_runs
    try {
      await supabaseAdmin
        .from("cron_runs" as never)
        .update({
          status: "failed",
          finished_at: finishedAt,
          duration_ms: durationMs,
          error: errorMessage,
        } as never)
        .eq("id" as never, runId as never);
    } catch (updateFailedErr) {
      console.error("[cron/orchestrator] Erreur mise à jour cron_runs (failed) :", updateFailedErr);
    }

    // 5.5 Enregistrement dans system_events
    try {
      await supabaseAdmin.from("system_events").insert({
        area: "cron",
        level: "error",
        message: `Échec cron reminders (${triggeredBy}) : ${errorMessage}`,
        detail: {
          run_id: runId,
          triggered_by: triggeredBy,
          duration_ms: durationMs,
          error: errorMessage,
        },
      });
    } catch (sysEvErr) {
      console.error("[cron/orchestrator] Erreur enregistrement system_events :", sysEvErr);
    }

    // IMPORTANT : lastKnownSuccessAt N'EST PAS mis à jour en cas d'échec pour permettre une nouvelle tentative

    return {
      executed: true,
      ok: false,
      runId,
      error: errorMessage,
      durationMs,
    };
  } finally {
    isExecutingInMemory = false;
    lastDbCheckAt = Date.now();

    // 5.6 Libération garantie du verrou distribué
    try {
      await supabaseAdmin.rpc(
        "release_cron_lock" as never,
        {
          _kind: "reminders",
          _locked_by: lockedBy,
        } as never,
      );
    } catch (releaseErr) {
      console.error("[cron/orchestrator] Erreur libération verrou cron_lock :", releaseErr);
    }
  }
}

/**
 * Fonction interne d'aide aux tests pour réinitialiser le cache mémoire local.
 */
export function _resetMemoryStateForTesting() {
  lastKnownSuccessAt = null;
  lastDbCheckAt = 0;
  isExecutingInMemory = false;
}
