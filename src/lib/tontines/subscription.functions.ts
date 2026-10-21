import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PayerMode = "same" | "rotate" | "custom";

async function srv() {
  return await import("./tontines.server");
}

/** Throws when the group cannot be used (not launched / subscription overdue). */
export async function assertGroupUsable(tontineId: string) {
  const { supabaseAdmin } = await srv();
  await supabaseAdmin.rpc("sync_group_subscription" as never, { _tontine_id: tontineId } as never);
  const { data: t } = await supabaseAdmin
    .from("tontines")
    .select("launched_at")
    .eq("id", tontineId)
    .maybeSingle();
  if (!t?.launched_at) throw new Error("GROUPE_NON_LANCE");
  const { count } = await supabaseAdmin
    .from("group_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("tontine_id", tontineId)
    .eq("status", "overdue");
  if ((count ?? 0) > 0) throw new Error("ABONNEMENT_EN_RETARD");
}

function payerAt(mode: string | null, order: string[], k: number) {
  if (!order.length || !mode) return null;
  return mode === "same" ? order[0]! : order[(k - 1) % order.length]!;
}

export const getGroupSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember } = await srv();
    const me = await requireMember(data.tontineId, context.userId);
    await supabaseAdmin.rpc("sync_group_subscription" as never, { _tontine_id: data.tontineId } as never);
    const [{ data: t }, { data: members }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("tontines").select("*").eq("id", data.tontineId).single(),
      supabaseAdmin
        .from("tontine_members")
        .select("id, name, role, position, user_id")
        .eq("tontine_id", data.tontineId)
        .eq("status", "active")
        .order("position"),
      supabaseAdmin
        .from("group_subscriptions")
        .select("*")
        .eq("tontine_id", data.tontineId)
        .order("cycle_idx", { ascending: false }),
    ]);
    if (!t) throw new Error("NOT_FOUND");
    const order = (t.sub_payer_order ?? []) as string[];
    const mode = t.sub_payer_mode as PayerMode | null;
    const list = subs ?? [];
    const lastIdx = list.length ? Math.max(...list.map((s) => s.cycle_idx ?? 0)) : 0;
    const open = list.find((s) => s.status === "overdue") ?? list.find((s) => s.status === "pending") ?? null;
    const current = open ?? list[0] ?? null;
    const next1 = (t.sub_next_payer as string | null) ?? payerAt(mode, order, lastIdx + 1);
    const next2 = payerAt(mode, order, lastIdx + 2);
    const blocked = list.some((s) => s.status === "overdue");
    const configured = !!mode && order.length > 0 && (mode === "same" || order.length >= 2);
    const start = new Date(t.created_at);
    const nextDue = new Date(start);
    nextDue.setMonth(start.getMonth() + lastIdx + 1);
    const isPayer = !!open && open.payer_member_id === me.id;
    return {
      launched: !!t.launched_at,
      configured,
      mode,
      order,
      allowOthers: t.sub_allow_others,
      nextPayerOverride: t.sub_next_payer as string | null,
      members: (members ?? []).map((m) => ({ id: m.id, name: m.name, role: m.role, isMe: m.user_id === context.userId })),
      isAdmin: me.role === "admin",
      myMemberId: me.id,
      currentPayer: (open?.payer_member_id ?? current?.payer_member_id ?? payerAt(mode, order, Math.max(lastIdx, 1))) as string | null,
      nextPayer: next1,
      followingPayer: next2,
      nextDueDate: nextDue.toISOString().slice(0, 10),
      freeUntil: list.find((s) => s.cycle_idx === 0)?.period_end ?? null,
      open,
      blocked,
      isPayer,
      canPay: !!open && (isPayer || t.sub_allow_others),
      history: list,
    };
  });

export const setSubscriptionConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { tontineId: string; mode: PayerMode; order: string[]; allowOthers: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity } = await srv();
    const admin = await requireGroupAdmin(data.tontineId, context.userId);
    if (!["same", "rotate", "custom"].includes(data.mode)) throw new Error("MODE_INVALIDE");
    const order = Array.from(new Set(data.order));
    if (!order.length) throw new Error("PAYEUR_REQUIS");
    if (data.mode !== "same" && order.length < 2) throw new Error("ROTATION_2_PAYEURS");
    const { data: ms } = await supabaseAdmin
      .from("tontine_members")
      .select("id, name")
      .eq("tontine_id", data.tontineId)
      .eq("status", "active")
      .in("id", order);
    if ((ms ?? []).length !== order.length) throw new Error("MEMBRE_INVALIDE");
    const finalOrder = data.mode === "same" ? order.slice(0, 1) : order;
    const { error } = await supabaseAdmin
      .from("tontines")
      .update({
        sub_payer_mode: data.mode,
        sub_payer_order: finalOrder,
        sub_allow_others: data.allowOthers,
        sub_next_payer: null,
      } as never)
      .eq("id", data.tontineId);
    if (error) throw new Error(error.message);
    const names = finalOrder.map((id) => ms!.find((m) => m.id === id)?.name).join(" → ");
    const label = { same: "même payeur", rotate: "changement à chaque échéance", custom: "ordre personnalisé" }[data.mode];
    await logActivity(data.tontineId, context.userId, "subscription", `${admin.name} a configuré l'abonnement : ${label} (${names}).`);
    return { ok: true };
  });

export const setNextSubscriptionPayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string; memberId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity } = await srv();
    const admin = await requireGroupAdmin(data.tontineId, context.userId);
    let name = "rotation automatique";
    if (data.memberId) {
      const { data: m } = await supabaseAdmin
        .from("tontine_members")
        .select("name")
        .eq("id", data.memberId)
        .eq("tontine_id", data.tontineId)
        .eq("status", "active")
        .maybeSingle();
      if (!m) throw new Error("MEMBRE_INVALIDE");
      name = m.name;
    }
    await supabaseAdmin.from("tontines").update({ sub_next_payer: data.memberId } as never).eq("id", data.tontineId);
    await logActivity(data.tontineId, context.userId, "subscription", `${admin.name} a désigné le prochain payeur : ${name}.`);
    return { ok: true };
  });

export const launchTontine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity } = await srv();
    const admin = await requireGroupAdmin(data.tontineId, context.userId);
    const { data: t } = await supabaseAdmin.from("tontines").select("*").eq("id", data.tontineId).single();
    if (!t) throw new Error("NOT_FOUND");
    if (t.launched_at) return { ok: true };
    const order = (t.sub_payer_order ?? []) as string[];
    if (!t.sub_payer_mode || !order.length || (t.sub_payer_mode !== "same" && order.length < 2))
      throw new Error("CONFIG_ABONNEMENT_REQUISE");
    const { count: coAdmins } = await supabaseAdmin
      .from("tontine_members")
      .select("id", { count: "exact", head: true })
      .eq("tontine_id", data.tontineId)
      .eq("role", "co_admin")
      .eq("status", "active");
    if (!coAdmins) throw new Error("DEUXIEME_ADMIN_REQUIS");
    await supabaseAdmin.from("tontines").update({ launched_at: new Date().toISOString() } as never).eq("id", data.tontineId);
    await logActivity(data.tontineId, context.userId, "group", `${admin.name} a lancé la tontine.`);
    await supabaseAdmin.rpc("sync_group_subscription" as never, { _tontine_id: data.tontineId } as never);
    return { ok: true };
  });

/** Subscriptions the signed-in user must pay (for the home alert). */
export const listMySubscriptionDues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await srv();
    const { data: mine } = await supabaseAdmin
      .from("tontine_members")
      .select("id, tontine_id")
      .eq("user_id", context.userId)
      .eq("status", "active");
    const ids = (mine ?? []).map((m) => m.tontine_id);
    if (!ids.length) return [];
    for (const id of ids)
      await supabaseAdmin.rpc("sync_group_subscription" as never, { _tontine_id: id } as never);
    const { data: subs } = await supabaseAdmin
      .from("group_subscriptions")
      .select("id, tontine_id, group_name, price_locked, currency, due_date, status, payer_member_id")
      .in("tontine_id", ids)
      .in("status", ["pending", "overdue"]);
    const myIds = new Set((mine ?? []).map((m) => m.id));
    return (subs ?? []).map((s) => ({
      id: s.id,
      tontineId: s.tontine_id as string,
      groupName: s.group_name,
      amount: Number(s.price_locked),
      currency: s.currency,
      dueDate: s.due_date as string,
      status: s.status as "pending" | "overdue",
      isPayer: !!s.payer_member_id && myIds.has(s.payer_member_id),
    }));
  });

export const initiateSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string; msisdn: string; idempotencyKey: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember } = await srv();
    const { data: existing } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, reference, status")
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) return existing;

    const { data: sub } = await supabaseAdmin
      .from("group_subscriptions")
      .select("*")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (!sub?.tontine_id) throw new Error("ABONNEMENT_INTROUVABLE");
    if (!["pending", "overdue"].includes(sub.status)) throw new Error("DEJA_PAYE");
    const me = await requireMember(sub.tontine_id, context.userId);
    const { data: t } = await supabaseAdmin
      .from("tontines")
      .select("sub_allow_others")
      .eq("id", sub.tontine_id)
      .single();
    if (sub.payer_member_id !== me.id && !t?.sub_allow_others) throw new Error("PAS_LE_PAYEUR");
    if (!/^\+?\d{8,15}$/.test(data.msisdn.replace(/\s/g, ""))) throw new Error("NUMERO_INVALIDE");
    const { assertDisputePriority } = await import("./disputes.server");
    await assertDisputePriority(context.userId, { kind: "subscription", id: sub.id, since: String(sub.due_date) });

    const { data: providers } = await supabaseAdmin
      .from("payment_providers")
      .select("id, slug, environment, api_base_url, public_key, secret_ref, currencies")
      .eq("enabled", true)
      .order("priority", { ascending: true });
    const provider = (providers ?? []).find((p) => (p.currencies ?? []).includes(sub.currency)) ?? null;
    if (!provider) throw new Error("AUCUN_FOURNISSEUR");

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const reference = `ZKA-PAY-${stamp}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    const amount = Number(sub.price_locked);
    const { data: inserted, error } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        reference,
        idempotency_key: data.idempotencyKey,
        provider_id: provider.id,
        kind: "subscription",
        group_ref: sub.tontine_id,
        due_ref: sub.id,
        member_id: context.userId,
        msisdn: data.msisdn,
        amount,
        contribution_amount: amount,
        penalty_amount: 0,
        due_date: sub.due_date,
        currency: sub.currency,
        status: "PENDING",
      })
      .select("id, reference, status")
      .single();
    if (error) throw new Error(error.message);

    const { getAdapter } = await import("@/lib/payments/adapters.server");
    const adapter = getAdapter(provider);
    if (adapter) {
      const origin = new URL(getRequest().url).origin;
      try {
        const res = await adapter.collect({
          reference,
          amount,
          currency: sub.currency as "CDF" | "USD",
          msisdn: data.msisdn.replace(/[^\d]/g, ""),
          description: `ZUKA PAY abonnement ${sub.group_name}`,
          callbackUrl: `${origin}/api/public/webhooks/mobile-money/${provider.slug}`,
        });
        await supabaseAdmin
          .from("payment_transactions")
          .update({ status: res.status, provider_reference: res.providerReference, updated_at: new Date().toISOString() })
          .eq("reference", reference);
        if (res.status === "SUCCESS") await supabaseAdmin.rpc("apply_payment_success", { _reference: reference });
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
    return inserted;
  });
