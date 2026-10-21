import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Creates (or returns) a Mobile Money transaction for a contribution.
 * Idempotent: the same idempotency key always maps to the same transaction.
 * A transaction is NEVER marked successful here — only the provider webhook does that.
 */
export const initiateContributionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      groupRef: string;
      dueRef: string;
      amount: number;
      currency: "CDF" | "USD";
      msisdn: string;
      idempotencyKey: string;
      providerSlug?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/admin/admin.server");
    if (data.amount <= 0) throw new Error("INVALID_AMOUNT");
    const { assertGroupUsable } = await import("@/lib/tontines/subscription.functions");
    await assertGroupUsable(data.groupRef);

    const { data: existing } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, reference, status")
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) return existing;

    const { data: providers } = await supabaseAdmin
      .from("payment_providers")
      .select("id, slug, environment, api_base_url, public_key, secret_ref, currencies")
      .eq("enabled", true)
      .order("priority", { ascending: true });
    const provider =
      (providers ?? []).find((p) =>
        data.providerSlug ? p.slug === data.providerSlug : (p.currencies ?? []).includes(data.currency),
      ) ?? null;
    // No live aggregator = no real confirmation possible; refuse instead of
    // leaving a transaction stuck in PENDING forever.
    if (!provider) throw new Error("AUCUN_FOURNISSEUR");
    const providerId = provider.id;

    // Late penalty — computed exclusively on the server from the group settings.
    const { data: tontine } = await supabaseAdmin
      .from("tontines")
      .select("id, currency, late_penalty_enabled, late_penalty_amount")
      .eq("id", data.groupRef)
      .maybeSingle();
    const { data: period } = await supabaseAdmin
      .from("contribution_periods")
      .select("id, due_date")
      .eq("id", data.dueRef)
      .eq("tontine_id", data.groupRef)
      .maybeSingle();
    const { data: memberRow } = await supabaseAdmin
      .from("tontine_members")
      .select("id")
      .eq("tontine_id", data.groupRef)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!tontine || !period || !memberRow) throw new Error("COTISATION_INTROUVABLE");
    if (tontine.currency !== data.currency) throw new Error("DEVISE_INVALIDE");
    const { data: contribution } = await supabaseAdmin
      .from("contributions")
      .select("id, amount_due, amount_paid")
      .eq("period_id", period.id)
      .eq("member_id", memberRow.id)
      .maybeSingle();
    if (!contribution) throw new Error("COTISATION_INTROUVABLE");
    const rest = Number(contribution.amount_due) - Number(contribution.amount_paid);
    if (rest <= 0) throw new Error("DEJA_PAYEE");
    const contributionAmount = Math.min(data.amount, rest);
    // Older disputes (debts, old contributions, overdue subscriptions) must be settled first.
    const { assertDisputePriority } = await import("@/lib/tontines/disputes.server");
    await assertDisputePriority(context.userId, { kind: "contribution", id: contribution.id, since: period.due_date });

    const today = new Date().toISOString().slice(0, 10);
    const daysLate = Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(period.due_date)) / 86_400_000),
    );
    let penalty = 0;
    if (daysLate > 0 && tontine.late_penalty_enabled && Number(tontine.late_penalty_amount) > 0) {
      const { data: existingPenalty } = await supabaseAdmin
        .from("late_penalties")
        .select("amount, status")
        .eq("contribution_id", contribution.id)
        .maybeSingle();
      if (!existingPenalty) {
        penalty = Number(tontine.late_penalty_amount);
        await supabaseAdmin.from("late_penalties").insert({
          tontine_id: tontine.id,
          contribution_id: contribution.id,
          period_id: period.id,
          member_id: memberRow.id,
          amount: penalty,
          currency: tontine.currency,
          due_date: period.due_date,
          days_late: daysLate,
        });
      } else if (existingPenalty.status !== "paid") {
        penalty = Number(existingPenalty.amount);
      }
    }

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const suffix = String(Math.floor(100000 + Math.random() * 900000));
    const reference = `ZKA-PAY-${stamp}-${suffix}`;
    const total = contributionAmount + penalty;

    const { data: inserted, error } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        reference,
        idempotency_key: data.idempotencyKey,
        provider_id: providerId,
        kind: "contribution",
        group_ref: data.groupRef,
        due_ref: data.dueRef,
        member_id: context.userId,
        msisdn: data.msisdn,
        amount: total,
        contribution_amount: contributionAmount,
        penalty_amount: penalty,
        due_date: period.due_date,
        days_late: daysLate,
        currency: data.currency,
        status: "PENDING",
      })
      .select("id, reference, status")
      .single();
    if (error) throw new Error(error.message);
    data = { ...data, amount: total };

    // Ask the real aggregator to push the payment request to the subscriber.
    if (provider) {
      const { getAdapter } = await import("./adapters.server");
      const adapter = getAdapter(provider);
      if (adapter) {
        const origin = new URL(getRequest().url).origin;
        try {
          const res = await adapter.collect({
            reference,
            amount: data.amount,
            currency: data.currency,
            msisdn: data.msisdn.replace(/[^\d]/g, ""),
            description: `ZUKA PAY ${data.groupRef}`,
            callbackUrl: `${origin}/api/public/webhooks/mobile-money/${provider.slug}`,
          });
          await supabaseAdmin
            .from("payment_transactions")
            .update({
              status: res.status,
              provider_reference: res.providerReference,
              updated_at: new Date().toISOString(),
            })
            .eq("reference", reference);
          return { ...inserted, status: res.status };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Initiation impossible";
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "FAILED", failure_reason: message, updated_at: new Date().toISOString() })
            .eq("reference", reference);
          throw new Error(message);
        }
      }
    }

    return inserted;
  });

export const getTransactionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/admin/admin.server");
    const { data: tx } = await supabaseAdmin
      .from("payment_transactions")
      .select(
        "reference, status, amount, currency, member_id, failure_reason, provider_reference, provider_id",
      )
      .eq("reference", data.reference)
      .maybeSingle();
    if (!tx || tx.member_id !== context.userId) throw new Error("NOT_FOUND");

    let status = tx.status;
    // Poll the aggregator while the payment is not final — the provider stays the source of truth.
    if (["PENDING", "PROCESSING"].includes(status) && tx.provider_id) {
      const { data: provider } = await supabaseAdmin
        .from("payment_providers")
        .select("id, slug, environment, api_base_url, public_key, secret_ref")
        .eq("id", tx.provider_id)
        .maybeSingle();
      if (provider) {
        const { getAdapter } = await import("./adapters.server");
        const adapter = getAdapter(provider);
        if (adapter) {
          try {
            const live = await adapter.status(tx.reference, tx.provider_reference);
            if (live !== status) {
              status = live;
              await supabaseAdmin
                .from("payment_transactions")
                .update({ status: live, updated_at: new Date().toISOString() })
                .eq("reference", tx.reference);
              if (live === "SUCCESS")
                await supabaseAdmin.rpc("apply_payment_success", { _reference: tx.reference });
            }
          } catch {
            // transient provider issue — keep the stored status
          }
        }
      }
    }

    return {
      reference: tx.reference,
      status,
      amount: Number(tx.amount),
      currency: tx.currency,
      failureReason: tx.failure_reason,
    };
  });
