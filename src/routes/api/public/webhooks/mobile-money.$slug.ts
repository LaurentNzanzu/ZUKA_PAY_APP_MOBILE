import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const STATUS_MAP: Record<string, string> = {
  success: "SUCCESS",
  succeeded: "SUCCESS",
  completed: "SUCCESS",
  failed: "FAILED",
  error: "FAILED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  expired: "EXPIRED",
  pending: "PENDING",
  processing: "PROCESSING",
};

export const Route = createFileRoute("/api/public/webhooks/mobile-money/$slug")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin, audit } = await import("@/lib/admin/admin.server");

        const { data: provider } = await supabaseAdmin
          .from("payment_providers")
          .select("id, slug, secret_ref")
          .eq("slug", params.slug)
          .maybeSingle();
        if (!provider) return new Response("Unknown provider", { status: 404 });

        const secret = provider.secret_ref ? process.env[provider.secret_ref] : undefined;
        if (!secret) return new Response("Provider not configured", { status: 503 });

        const body = await request.text();
        const signature = request.headers.get("x-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        const valid = sig.length === exp.length && timingSafeEqual(sig, exp);
        if (!valid) return new Response("Invalid signature", { status: 401 });

        let payload: {
          event_id?: string;
          reference?: string;
          status?: string;
          provider_reference?: string;
          reason?: string;
        };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const eventId = payload.event_id ?? expected.slice(0, 32);
        const { error: dedupeError } = await supabaseAdmin
          .from("payment_webhooks")
          .insert({
            provider_id: provider.id,
            event_id: eventId,
            signature_valid: true,
            processed: false,
            payload: payload as never,
          });
        // duplicate delivery → already handled, acknowledge without reprocessing
        if (dedupeError) return new Response("ok (duplicate)", { status: 200 });

        const status = STATUS_MAP[(payload.status ?? "").toLowerCase()];
        if (payload.reference && status) {
          await supabaseAdmin
            .from("payment_transactions")
            .update({
              status,
              provider_reference: payload.provider_reference ?? null,
              failure_reason: status === "FAILED" ? (payload.reason ?? null) : null,
              updated_at: new Date().toISOString(),
            })
            .eq("reference", payload.reference);

          if (status === "SUCCESS")
            await supabaseAdmin.rpc("apply_payment_success", { _reference: payload.reference });

          await supabaseAdmin
            .from("payment_webhooks")
            .update({ processed: true })
            .eq("provider_id", provider.id)
            .eq("event_id", eventId);

          await audit({
            actorId: null,
            actorEmail: `webhook:${provider.slug}`,
            action: "payment.status_updated",
            entityType: "payment_transaction",
            entityId: payload.reference,
            newValue: { status },
            result: status === "FAILED" ? "failure" : "success",
          });
        }

        return new Response("ok");
      },
    },
  },
});
