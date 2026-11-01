import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { maybeRunCron } from "@/lib/cron/maybe-run.server";

/**
 * Endpoint HTTP sécurisé pour le déclenchement manuel ou planifié du cron des rappels.
 * Protégé par CRON_SECRET / LOVABLE_CRON_SECRET via authenticateCronRequest.
 * Coordonné avec le verrou distribué PostgreSQL afin d'éviter tout conflit avec
 * les déclenchements automatiques (intervalle ou requêtes).
 */
export const Route = createFileRoute("/api/public/cron/reminders")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const result = await maybeRunCron("manual");

        if (!result.executed) {
          return Response.json(
            {
              ok: false,
              error: "Une exécution du cron est déjà en cours ou le verrou est actif.",
              reason: result.reason,
            },
            { status: 409 },
          );
        }

        if (!result.ok) {
          return Response.json(
            {
              ok: false,
              error: result.error ?? "Erreur lors de l'exécution du cron.",
              runId: result.runId,
            },
            { status: 500 },
          );
        }

        return Response.json({
          ok: true,
          created: result.created ?? 0,
          durationMs: result.durationMs,
          runId: result.runId,
          otpCleanup: result.otpCleanup,
        });
      },
    },
  },
});
