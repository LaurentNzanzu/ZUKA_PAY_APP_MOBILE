import { runRemindersCron } from "./reminders-runner.server";

const INSTANCE_ID = crypto.randomUUID();
const FAST_PATH_FRESH_MS = 22 * 3600_000; // 22h : skip si dernier run récent
const DB_CHECK_MIN_INTERVAL_MS = 60_000; // 1 min : min entre 2 vérifs DB
const LOCK_TIMEOUT_SEC = 900; // 15 min : auto-release si crash

let lastKnownRunAt = 0;
let lastCheckAt = 0;
let inFlight = false;

/**
 * Orchestrateur central. Appelé par le Nitro plugin (interval) ET par le
 * request middleware (request). Garantit :
 *   - Aucune double exécution (lock DB + garde 5 min)
 *   - Aucune auto-destruction (try/finally + timeout 15 min)
 *   - Aucun blocage de requête (fire-and-forget côté middleware)
 *   - Aucune erreur remontée au caller (tout try/catch + log)
 */
export async function maybeRunCron(
  triggeredBy: "interval" | "request" | "boot",
): Promise<void> {
  const now = Date.now();

  // 1. Fast path mémoire — 99% des requêtes sortent ici sans DB
  if (now - lastKnownRunAt < FAST_PATH_FRESH_MS) return;
  if (inFlight) return;
  if (now - lastCheckAt < DB_CHECK_MIN_INTERVAL_MS) return;
  lastCheckAt = now;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 2. Vérif DB — quand le dernier run réussi/failed a eu lieu ?
  try {
    const { data: lastRun } = await supabaseAdmin
      .from("cron_runs")
      .select("started_at")
      .eq("kind", "reminders")
      .in("status", ["success", "failed"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastRunAtMs = lastRun?.started_at
      ? new Date(lastRun.started_at).getTime()
      : 0;

    if (now - lastRunAtMs < FAST_PATH_FRESH_MS) {
      lastKnownRunAt = lastRunAtMs;
      return;
    }
  } catch (err) {
    console.error("[cron] DB check failed:", err);
    return;
  }

  // 3. Acquisition du lock
  let acquired = false;
  try {
    const { data } = await supabaseAdmin.rpc("acquire_cron_lock", {
      _kind: "reminders",
      _instance_id: INSTANCE_ID,
      _timeout_sec: LOCK_TIMEOUT_SEC,
    });
    acquired = Boolean(data);
  } catch (err) {
    console.error("[cron] acquire_cron_lock failed:", err);
    return;
  }
  if (!acquired) return;

  // 4. Enregistrer le début du run
  let runId: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("cron_runs")
      .insert({ kind: "reminders", triggered_by: triggeredBy, status: "running" })
      .select("id")
      .single();
    runId = data?.id ?? null;
  } catch (err) {
    console.error("[cron] failed to log run start:", err);
  }

  inFlight = true;
  const startTime = Date.now();

  // 5. Exécution avec try/finally GARANTI
  try {
    const result = await runRemindersCron();
    const duration = Date.now() - startTime;

    if (runId) {
      try {
        await supabaseAdmin.from("cron_runs").update({
          finished_at: new Date().toISOString(),
          status: "success",
          duration_ms: duration,
          created_count: result.created,
        }).eq("id", runId);
      } catch (err) {
        console.error("[cron] failed to log success:", err);
      }
    }
    lastKnownRunAt = Date.now();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - startTime;

    if (runId) {
      try {
        await supabaseAdmin.from("cron_runs").update({
          finished_at: new Date().toISOString(),
          status: "failed",
          error: message.slice(0, 500),
          duration_ms: duration,
        }).eq("id", runId);
      } catch { /* ignore */ }
    }
    try {
      await supabaseAdmin.from("system_events").insert({
        area: "cron",
        level: "error",
        message: `Cron failed (${triggeredBy}): ${message.slice(0, 200)}`,
      });
    } catch { /* ignore */ }
  } finally {
    inFlight = false;
    try {
      await supabaseAdmin.rpc("release_cron_lock", {
        _kind: "reminders",
        _instance_id: INSTANCE_ID,
      });
    } catch (err) {
      // Non-bloquant : le lock expirera de toute façon après 15 min
      console.error("[cron] release lock failed (will auto-expire):", err);
    }
  }
}
