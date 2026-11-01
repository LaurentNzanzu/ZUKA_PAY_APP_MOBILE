import type { NitroApp } from "nitro/types";
import { maybeRunCron } from "@/lib/cron/maybe-run.server";

/**
 * Helper de typage pour définir un plugin Nitro conforme.
 */
export function defineNitroPlugin(def: (nitroApp: NitroApp) => void) {
  return def;
}

/**
 * Détecte si le runtime d'exécution actuel est un environnement serverless / éphémère.
 * Sur ces plateformes, `setInterval` est gelé ou détruit dès la fin de la réponse HTTP.
 */
export function detectServerlessPlatform(): string | null {
  const env = process.env;
  if (env["CF_PAGES"] || env["CLOUDFLARE_WORKERS"]) return "Cloudflare Workers / Pages";
  if (env["LOVABLE_NITRO_PRESET"] === "cloudflare-module") return "Cloudflare Module";
  if (env["VERCEL"] || env["NOW_REGION"]) return "Vercel";
  if (env["NETLIFY"]) return "Netlify";
  if (env["AWS_LAMBDA_FUNCTION_NAME"] || env["LAMBDA_TASK_ROOT"]) return "AWS Lambda";
  if (
    typeof navigator !== "undefined" &&
    (navigator as { userAgent?: string }).userAgent === "Cloudflare-Workers"
  ) {
    return "Cloudflare Runtime";
  }
  return null;
}

let schedulerInitialized = false;

/**
 * Initialise le planificateur d'intervalle sur les runtimes always-on.
 * Peut être appelé par le plugin Nitro ou lors de l'initialisation du serveur.
 */
export function initCronScheduler(nitroApp?: NitroApp) {
  if (schedulerInitialized) return;
  schedulerInitialized = true;

  const isEnabled = process.env["CRON_INTERVAL_ENABLED"] === "true";
  const serverlessPlatform = detectServerlessPlatform();

  if (serverlessPlatform) {
    console.info(
      `[cron/scheduler] Runtime serverless détecté (${serverlessPlatform}) : setInterval désactivé. Le déclenchement repose sur le Request Middleware et/ou le webhook HTTP.`,
    );
    return;
  }

  if (!isEnabled) {
    console.info(
      "[cron/scheduler] CRON_INTERVAL_ENABLED n'est pas activé ('true'). Le scheduler par intervalle est inactif.",
    );
    return;
  }

  const rawMinutes = parseInt(process.env["CRON_INTERVAL_MINUTES"] || "15", 10);
  const intervalMinutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? rawMinutes : 15;
  const intervalMs = intervalMinutes * 60 * 1000;

  console.info(
    `[cron/scheduler] Initialisation du scheduler Nitro (intervalle: ${intervalMinutes} min, runtime: always-on).`,
  );

  // 1. Catch-up initial après le démarrage du serveur (délai de grâce de 5 secondes)
  const bootTimer = setTimeout(() => {
    void maybeRunCron("boot").catch((err) => {
      console.error("[cron/scheduler] Erreur lors du catch-up de démarrage :", err);
    });
  }, 5000);

  if (typeof bootTimer === "object" && "unref" in bootTimer) {
    bootTimer.unref();
  }

  // 2. Intervalle récurrent contrôlé
  const intervalTimer = setInterval(() => {
    void maybeRunCron("interval").catch((err) => {
      console.error("[cron/scheduler] Erreur lors de l'intervalle cron :", err);
    });
  }, intervalMs);

  if (typeof intervalTimer === "object" && "unref" in intervalTimer) {
    intervalTimer.unref();
  }

  // 3. Nettoyage propre à l'arrêt du serveur Nitro
  if (nitroApp?.hooks?.hook) {
    nitroApp.hooks.hook("close", () => {
      clearTimeout(bootTimer);
      clearInterval(intervalTimer);
      console.info("[cron/scheduler] Arrêt propre du scheduler Nitro.");
    });
  }
}

/**
 * Plugin Nitro standard conforme à la spécification Nitro.
 */
export default defineNitroPlugin((nitroApp: NitroApp) => {
  initCronScheduler(nitroApp);
});
