import { createMiddleware } from "@tanstack/react-start";

/**
 * Middleware universel — s'exécute sur CHAQUE requête HTTP entrante.
 * Fire-and-forget : n'attend pas la fin du cron, ne bloque jamais la réponse.
 * Si le runtime est serverless et qu'il y a eu un long silence, ce middleware
 * est le SEUL moyen de déclencher le catch-up → à ne JAMAIS retirer.
 */
export const cronTriggerMiddleware = createMiddleware().server(async ({ next }) => {
  // Ne PAS await — fire and forget
  void import("@/lib/cron/maybe-run.server")
    .then((m) => m.maybeRunCron("request"))
    .catch((err) => {
      // Un échec ici ne doit JAMAIS affecter la requête en cours
      console.error("[cron] request-trigger failed:", err);
    });

  return next();
});
