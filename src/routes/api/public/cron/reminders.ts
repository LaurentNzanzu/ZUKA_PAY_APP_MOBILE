import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Daily reminder job. Creates in-app notifications (and SMS when a provider is
 * configured) for J-3, J-1, the due day and late contributions.
 * Anti-spam: one notification per member, per period and per kind.
 */
export const Route = createFileRoute("/api/public/cron/reminders")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/lib/admin/admin.server");
        const today = new Date();
        const targets: { date: string; kind: string; title: string }[] = [
          { date: iso(new Date(today.getTime() + 3 * DAY)), kind: "due_j3", title: "Cotisation dans 3 jours" },
          { date: iso(new Date(today.getTime() + DAY)), kind: "due_j1", title: "Cotisation demain" },
          { date: iso(today), kind: "due_today", title: "Cotisation à payer aujourd'hui" },
          { date: iso(new Date(today.getTime() - DAY)), kind: "due_late", title: "Cotisation en retard" },
        ];

        const { data: sms } = await supabaseAdmin
          .from("sms_providers")
          .select("*")
          .eq("enabled", true)
          .maybeSingle();
        const { sendSms, smsConfigured } = await import("@/lib/sms/sms.server");
        const { data: smsSetting } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "notif.sms_enabled")
          .maybeSingle();
        const smsOn = smsSetting?.value === true && smsConfigured(sms);

        // Monthly group subscriptions: open new cycles, mark overdue ones, notify payers.
        const { data: allTontines } = await supabaseAdmin.from("tontines").select("id");
        for (const tt of allTontines ?? [])
          await supabaseAdmin.rpc("sync_group_subscription" as never, { _tontine_id: tt.id } as never);
        // Admin succession (principal inactive 6 months) and archiving (no payment for 6 months).
        await supabaseAdmin.rpc("run_group_governance" as never);

        let created = 0;
        for (const t of targets) {
          const { data: periods } = await supabaseAdmin
            .from("contribution_periods")
            .select("id, tontine_id, due_date, tontines(name, currency, amount, late_penalty_enabled, late_penalty_amount)")
            .eq("due_date", t.date);
          for (const p of periods ?? []) {
            const { data: contributions } = await supabaseAdmin
              .from("contributions")
              .select("id, member_id, amount_due, amount_paid, status")
              .eq("period_id", p.id);
            for (const c of contributions ?? []) {
              if (Number(c.amount_due) <= Number(c.amount_paid)) continue;
              const { data: member } = await supabaseAdmin
                .from("tontine_members")
                .select("user_id, name, phone, status")
                .eq("id", c.member_id)
                .maybeSingle();
              if (!member?.user_id || member.status !== "active") continue;

              const tontine = p.tontines as {
                name?: string;
                currency?: string;
                late_penalty_enabled?: boolean;
                late_penalty_amount?: number;
              } | null;

              // Late penalty: recorded once per contribution, notified once.
              if (
                t.kind === "due_late" &&
                tontine?.late_penalty_enabled &&
                Number(tontine.late_penalty_amount) > 0
              ) {
                const pen = Number(tontine.late_penalty_amount);
                const { error: penErr } = await supabaseAdmin.from("late_penalties").insert({
                  tontine_id: p.tontine_id,
                  contribution_id: c.id,
                  period_id: p.id,
                  member_id: c.member_id,
                  amount: pen,
                  currency: tontine.currency ?? "CDF",
                  due_date: p.due_date,
                  days_late: 1,
                });
                if (!penErr) {
                  const rest0 = Number(c.amount_due) - Number(c.amount_paid);
                  const fmt = (n: number) => n.toLocaleString("fr-FR");
                  await supabaseAdmin.from("notifications").insert({
                    user_id: member.user_id,
                    tontine_id: p.tontine_id,
                    kind: "late_penalty",
                    title: "Pénalité de retard appliquée",
                    body: `Votre cotisation de ${fmt(rest0)} ${tontine.currency} est en retard. Une pénalité de ${fmt(pen)} ${tontine.currency} a été ajoutée. Total à payer : ${fmt(rest0 + pen)} ${tontine.currency}.`,
                    channel: "in_app",
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    dedupe_key: `late_penalty:${c.id}`,
                  });
                  created += 1;
                }
              }
              const rest = Number(c.amount_due) - Number(c.amount_paid);
              const body = `${tontine?.name ?? "Tontine"} : ${rest.toLocaleString("fr-FR")} ${tontine?.currency ?? ""} à payer pour l'échéance du ${p.due_date}.`;
              const dedupe = `${t.kind}:${p.id}:${c.member_id}`;

              const { error } = await supabaseAdmin.from("notifications").insert({
                user_id: member.user_id,
                tontine_id: p.tontine_id,
                kind: t.kind,
                title: t.title,
                body,
                channel: smsOn ? "sms" : "in_app",
                status: "sent",
                sent_at: new Date().toISOString(),
                dedupe_key: dedupe,
              });
              if (error) continue; // duplicate → already reminded
              created += 1;

              if (smsOn && sms && member.phone) {
                const res = await sendSms(sms, member.phone, `ZUKA PAY — ${body}`);
                if (!res.ok)
                  await supabaseAdmin
                    .from("notifications")
                    .update({ status: "failed", error: res.error ?? "Erreur SMS" })
                    .eq("dedupe_key", dedupe);
              }
            }
            if (t.kind === "due_late")
              await supabaseAdmin
                .from("contributions")
                .update({ status: "late" })
                .eq("period_id", p.id)
                .neq("status", "paid")
                .lt("amount_paid", 1e12);
          }
        }

        // Daily mutual-credit eligibility refresh (closed periods, year change, 12-month anniversary).
        await (supabaseAdmin.rpc as unknown as (fn: string) => Promise<unknown>)(
          "recompute_all_group_eligibility",
        );

        await supabaseAdmin.from("system_events").insert({
          area: "cron",
          level: "info",
          message: `Rappels générés : ${created}`,
        });
        return Response.json({ ok: true, created });
      },
    },
  },
});
