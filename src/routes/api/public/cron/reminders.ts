import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runRemindersCron } from "@/lib/cron/reminders-runner.server";

export const Route = createFileRoute("/api/public/cron/reminders")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const result = await runRemindersCron();
        return Response.json(result);
      },
    },
  },
});
