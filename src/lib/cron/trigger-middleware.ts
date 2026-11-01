import { createMiddleware } from "@tanstack/react-start";
import { maybeRunCron } from "./maybe-run.server";

/**
 * Middleware TanStack Start déclenchant le cron de façon opportuniste lors des requêtes HTTP.
 *
 * Fonctionnement :
 * - Déclenchement strictement en "fire-and-forget" : le traitement de la requête utilisateur
 *   n'attend JAMAIS l'exécution du cron et ne subit aucun ralentissement.
 * - Aucune exception du cron ne peut faire échouer la requête HTTP cliente.
 * - Le filtrage amont (fast-path mémoire dans maybeRunCron) garantit qu'aucune surcharge DB
 *   n'est infligée lors de pics de trafic.
 *
 * Limites d'exécution relatives aux runtimes :
 * - Sur runtimes always-on (Node.js, conteneurs Docker, VPS) : la promesse fire-and-forget
 *   continue son exécution en arrière-plan sans interruption.
 * - Sur runtimes serverless stricts (Cloudflare Workers, AWS Lambda, Vercel Serverless) :
 *   le cycle de vie du worker peut être suspendu ou détruit dès que le flux de réponse HTTP
 *   est clos si `waitUntil` n'est pas fourni par le contexte de requête. Sur ces runtimes,
 *   il est recommandé de conserver un webhook d'appel HTTP externe planifié (ex: Cloudflare Cron Triggers
 *   ou Upstash QStash) pour garantir l'exécution même sans trafic actif ou pour éviter l'interruption
 *   prématurée de micro-tâches orphelines.
 */
export const cronTriggerMiddleware = createMiddleware().server(async ({ next }) => {
  // Déclenchement non bloquant (fire-and-forget)
  void maybeRunCron("request").catch((err) => {
    console.error("[cron/middleware] Erreur inattendue dans le trigger de requête :", err);
  });

  // Poursuite immédiate de la chaîne de middlewares et retour de la réponse
  return await next();
});
