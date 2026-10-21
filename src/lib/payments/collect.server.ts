import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Creates a PENDING transaction and asks the active aggregator to collect it. */
export async function createAndCollect(input: {
  idempotencyKey: string;
  kind: "proxy_contribution" | "proxy_subscription" | "debt_repayment";
  userId: string;
  groupRef: string;
  dueRef?: string | null;
  amount: number;
  currency: string;
  msisdn: string;
  description: string;
  dueDate?: string | null;
  proxyRequestId?: string | null;
  debtId?: string | null;
  beneficiaryUserId?: string | null;
  beneficiaryMsisdn?: string | null;
}) {
  const db = supabaseAdmin as any;
  const { data: existing } = await db
    .from("payment_transactions")
    .select("id, reference, status")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return existing;
  if (!/^\+?\d{8,15}$/.test(input.msisdn.replace(/\s/g, ""))) throw new Error("NUMERO_INVALIDE");

  const { data: providers } = await db
    .from("payment_providers")
    .select("id, slug, environment, api_base_url, public_key, secret_ref, currencies")
    .eq("enabled", true)
    .order("priority", { ascending: true });
  const provider = (providers ?? []).find((p: any) => (p.currencies ?? []).includes(input.currency)) ?? null;
  if (!provider) throw new Error("AUCUN_FOURNISSEUR");

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const reference = `ZKA-PAY-${stamp}-${String(Math.floor(100000 + Math.random() * 900000))}`;
  const { data: inserted, error } = await db
    .from("payment_transactions")
    .insert({
      reference,
      idempotency_key: input.idempotencyKey,
      provider_id: provider.id,
      kind: input.kind,
      group_ref: input.groupRef,
      due_ref: input.dueRef ?? null,
      member_id: input.userId,
      msisdn: input.msisdn,
      amount: input.amount,
      contribution_amount: input.amount,
      penalty_amount: 0,
      due_date: input.dueDate ?? null,
      currency: input.currency,
      status: "PENDING",
      proxy_request_id: input.proxyRequestId ?? null,
      debt_id: input.debtId ?? null,
      beneficiary_user_id: input.beneficiaryUserId ?? null,
      beneficiary_msisdn: input.beneficiaryMsisdn ?? null,
      payout_status: input.kind === "debt_repayment" ? "to_transfer" : null,
    })
    .select("id, reference, status")
    .single();
  if (error) throw new Error(error.message);

  const { getAdapter } = await import("./adapters.server");
  const adapter = getAdapter(provider);
  if (!adapter) return inserted;
  const origin = new URL(getRequest().url).origin;
  try {
    const res = await adapter.collect({
      reference,
      amount: input.amount,
      currency: input.currency,
      msisdn: input.msisdn.replace(/[^\d]/g, ""),
      description: input.description,
      callbackUrl: `${origin}/api/public/webhooks/mobile-money/${provider.slug}`,
    });
    await db
      .from("payment_transactions")
      .update({ status: res.status, provider_reference: res.providerReference, updated_at: new Date().toISOString() })
      .eq("reference", reference);
    if (res.status === "SUCCESS") await db.rpc("apply_payment_success", { _reference: reference });
    return { ...inserted, status: res.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Initiation impossible";
    await db
      .from("payment_transactions")
      .update({ status: "FAILED", failure_reason: message, updated_at: new Date().toISOString() })
      .eq("reference", reference);
    throw new Error(message);
  }
}
