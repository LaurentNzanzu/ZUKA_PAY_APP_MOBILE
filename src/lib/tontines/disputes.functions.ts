import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MAX_INTEREST = 8;
export const CO_ADMIN_PERMISSIONS = [
  "members",
  "approve_proxy",
  "invitations",
  "contributions",
  "late",
  "transactions",
  "notifications",
  "settings",
  "beneficiaries",
  "reimbursements",
] as const;
export type CoAdminPermission = (typeof CO_ADMIN_PERMISSIONS)[number];

type ProxyReq = { id: string; kind: string; status: string; amount: number; debtorPenalty: number; currency: string; dueDate: string; debtorName: string; payerName: string; mine: boolean; approvalRef: string | null; transactionRef: string | null };
type AdminChange = { id: string; at: string; reason: string; action: string; oldPrincipal: string; newPrincipal: string; newSecond: string; permissions: string[] };

const today = () => new Date().toISOString().slice(0, 10);
async function srv() {
  const s = await import("./tontines.server");
  return { ...s, db: s.supabaseAdmin as any };
}

/** Principal admin, or second admin holding `perm`. Touches admin activity. */
async function requireAdminPerm(tontineId: string, userId: string, perm: CoAdminPermission) {
  const { requireMember, db } = await srv();
  const m = await requireMember(tontineId, userId);
  const perms = ((m as any).admin_permissions ?? []) as string[];
  if (m.role === "admin" || (m.role === "co_admin" && perms.includes(perm))) {
    if (m.role === "admin")
      await db.from("tontines").update({ admin_last_active_at: new Date().toISOString() }).eq("id", tontineId);
    return m;
  }
  throw new Error("FORBIDDEN");
}

export const listMyDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDisputes } = await import("./disputes.server");
    const { db } = await srv();
    const disputes = await listDisputes(context.userId);
    const { data: credits } = await db
      .from("member_debts")
      .select("id, reason, total_amount_due, amount_paid, remaining_amount, interest_rate, currency, status, created_at, tontines(name)")
      .eq("creditor_user_id", context.userId)
      .order("created_at", { ascending: false });
    type Credit = { id: string; reason: string; groupName: string; total: number; paid: number; remaining: number; rate: number; currency: string; status: string };
    return {
      disputes,
      credits: (credits ?? []).map((c: any): Credit => ({
        id: c.id as string,
        reason: c.reason as string,
        groupName: c.tontines?.name ?? "",
        total: Number(c.total_amount_due),
        paid: Number(c.amount_paid),
        remaining: Number(c.remaining_amount),
        rate: Number(c.interest_rate),
        currency: c.currency as string,
        status: c.status as string,
      })),
    };
  });

/** Late members / overdue subscription in a group + proxy requests + governance. */
export const getGroupDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string }) => d)
  .handler(async ({ data, context }) => {
    const { requireMember, db } = await srv();
    const me = await requireMember(data.tontineId, context.userId);
    const [{ data: members }, { data: contribs }, { data: requests }, { data: subs }, { data: t }, { data: changes }] =
      await Promise.all([
        db.from("tontine_members").select("id, name, role, user_id, admin_permissions, status").eq("tontine_id", data.tontineId),
        db
          .from("contributions")
          .select("id, member_id, amount_due, amount_paid, contribution_periods!inner(due_date, idx)")
          .eq("tontine_id", data.tontineId)
          .lt("contribution_periods.due_date", today()),
        db.from("proxy_payment_requests").select("*").eq("tontine_id", data.tontineId).order("created_at", { ascending: false }),
        db.from("group_subscriptions").select("id, payer_member_id, price_locked, currency, due_date").eq("tontine_id", data.tontineId).eq("status", "overdue"),
        db.from("tontines").select("needs_second_admin, admin_last_active_at, archived_at").eq("id", data.tontineId).single(),
        db.from("group_admin_changes").select("*").eq("tontine_id", data.tontineId).order("created_at", { ascending: false }).limit(10),
      ]);
    const name = (id: string | null) => (members ?? []).find((m: any) => m.id === id)?.name ?? "—";
    const late = [
      ...(contribs ?? [])
        .filter((c: any) => Number(c.amount_due) > Number(c.amount_paid) && c.member_id !== me.id)
        .map((c: any) => ({
          kind: "contribution" as const,
          id: c.id as string,
          memberName: name(c.member_id),
          amount: Number(c.amount_due) - Number(c.amount_paid),
          dueDate: c.contribution_periods.due_date as string,
        })),
      ...(subs ?? [])
        .filter((s: any) => s.payer_member_id && s.payer_member_id !== me.id)
        .map((s: any) => ({
          kind: "subscription" as const,
          id: s.id as string,
          memberName: name(s.payer_member_id),
          amount: Number(s.price_locked),
          dueDate: s.due_date as string,
        })),
    ];
    const second = (members ?? []).find((m: any) => m.role === "co_admin" && m.status === "active");
    return {
      me: { id: me.id, role: me.role as string, permissions: ((me as any).admin_permissions ?? []) as string[] },
      late,
      requests: (requests ?? []).map((r: any): ProxyReq => ({
        id: r.id as string,
        kind: r.kind as string,
        status: r.status as string,
        amount: Number(r.amount),
        debtorPenalty: Number(r.debtor_penalty),
        currency: r.currency as string,
        dueDate: r.due_date as string,
        debtorName: name(r.debtor_member_id),
        payerName: name(r.payer_member_id),
        mine: r.payer_member_id === me.id,
        approvalRef: r.approval_ref as string | null,
        transactionRef: r.transaction_ref as string | null,
      })),
      members: (members ?? [])
        .filter((m: any) => m.status === "active")
        .map((m: any): { id: string; name: string; role: string } => ({ id: m.id, name: m.name, role: m.role })),
      secondAdmin: (second ? { id: second.id, name: second.name, permissions: second.admin_permissions } : null) as { id: string; name: string; permissions: string[] } | null,
      needsSecondAdmin: !!t?.needs_second_admin || !second,
      changes: (changes ?? []).map((c: any): AdminChange => ({
        id: c.id,
        at: c.created_at,
        reason: c.reason,
        action: c.trigger_action,
        oldPrincipal: name(c.old_principal),
        newPrincipal: name(c.new_principal),
        newSecond: name(c.new_second),
        permissions: c.permissions as string[],
      })),
    };
  });

export const requestProxyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string; kind: "contribution" | "subscription"; targetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { requireMember, db, logActivity, notify } = await srv();
    const me = await requireMember(data.tontineId, context.userId);
    let debtorMemberId: string, amount: number, dueDate: string, currency: string, penalty = 0;
    if (data.kind === "contribution") {
      const { data: c } = await db
        .from("contributions")
        .select("id, member_id, amount_due, amount_paid, tontine_id, contribution_periods(due_date), tontines(currency)")
        .eq("id", data.targetId)
        .eq("tontine_id", data.tontineId)
        .maybeSingle();
      if (!c) throw new Error("COTISATION_INTROUVABLE");
      debtorMemberId = c.member_id;
      amount = Number(c.amount_due) - Number(c.amount_paid);
      dueDate = c.contribution_periods.due_date;
      currency = c.tontines.currency;
      const { data: pen } = await db.from("late_penalties").select("amount, status").eq("contribution_id", c.id).maybeSingle();
      if (pen && pen.status !== "paid") penalty = Number(pen.amount);
    } else {
      const { data: s } = await db
        .from("group_subscriptions")
        .select("id, payer_member_id, price_locked, currency, due_date, status")
        .eq("id", data.targetId)
        .eq("tontine_id", data.tontineId)
        .maybeSingle();
      if (!s || !["pending", "overdue"].includes(s.status)) throw new Error("ABONNEMENT_INTROUVABLE");
      debtorMemberId = s.payer_member_id;
      amount = Number(s.price_locked);
      dueDate = s.due_date;
      currency = s.currency;
    }
    // Backend rule: only AFTER the due day, and only for an unpaid obligation.
    if (dueDate >= today()) throw new Error("JOUR_J_NON_DEPASSE");
    if (amount <= 0) throw new Error("DEJA_PAYEE");
    if (debtorMemberId === me.id) throw new Error("PROPRE_COTISATION");
    const { count } = await db
      .from("proxy_payment_requests")
      .select("id", { count: "exact", head: true })
      .eq(data.kind === "contribution" ? "contribution_id" : "subscription_id", data.targetId)
      .in("status", ["pending", "approved"]);
    if ((count ?? 0) > 0) throw new Error("DEMANDE_EXISTANTE");
    const { data: debtor } = await db.from("tontine_members").select("name, user_id").eq("id", debtorMemberId).single();
    const { data: req, error } = await db
      .from("proxy_payment_requests")
      .insert({
        tontine_id: data.tontineId,
        kind: data.kind,
        contribution_id: data.kind === "contribution" ? data.targetId : null,
        subscription_id: data.kind === "subscription" ? data.targetId : null,
        debtor_member_id: debtorMemberId,
        debtor_user_id: debtor?.user_id ?? null,
        payer_member_id: me.id,
        payer_user_id: context.userId,
        amount,
        debtor_penalty: penalty,
        currency,
        due_date: dueDate,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(data.tontineId, context.userId, "proxy", `${me.name} demande à payer pour ${debtor?.name ?? "un membre"} (${amount} ${currency}).`);
    const { data: admins } = await db
      .from("tontine_members")
      .select("user_id, role, admin_permissions")
      .eq("tontine_id", data.tontineId)
      .eq("status", "active")
      .in("role", ["admin", "co_admin"]);
    for (const a of admins ?? [])
      if (a.user_id && (a.role === "admin" || (a.admin_permissions ?? []).includes("approve_proxy")))
        await notify({
          userId: a.user_id,
          tontineId: data.tontineId,
          kind: "proxy",
          title: "Demande de paiement pour autrui",
          body: `${me.name} demande à payer ${amount} ${currency} pour ${debtor?.name ?? "un membre"}.`,
          dedupeKey: `proxy:${req.id}`,
        });
    return { id: req.id };
  });

export const resolveProxyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; approve: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { db, logActivity, notify } = await srv();
    const { data: r } = await db.from("proxy_payment_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!r || r.status !== "pending") throw new Error("DEMANDE_INTROUVABLE");
    const admin = await requireAdminPerm(r.tontine_id, context.userId, "approve_proxy");
    if (admin.id === r.payer_member_id && admin.role !== "admin") throw new Error("FORBIDDEN");
    const ref = `ZKA-APR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    await db
      .from("proxy_payment_requests")
      .update({
        status: data.approve ? "approved" : "refused",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        approval_ref: data.approve ? ref : null,
      })
      .eq("id", r.id)
      .eq("status", "pending");
    await logActivity(r.tontine_id, context.userId, "proxy", `${admin.name} a ${data.approve ? "approuvé" : "refusé"} une demande de paiement pour autrui${data.approve ? ` (${ref})` : ""}.`);
    await notify({
      userId: r.payer_user_id,
      tontineId: r.tontine_id,
      kind: "proxy",
      title: data.approve ? "Demande approuvée" : "Demande refusée",
      body: data.approve ? "Vous pouvez maintenant payer pour ce membre." : "L'administrateur a refusé votre demande.",
    });
    return { ok: true };
  });

export const payProxyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { requestId: string; msisdn: string; reimbursement: boolean; interestRate: number; idempotencyKey: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const { db } = await srv();
    const rate = data.reimbursement ? Number(data.interestRate) : 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_INTEREST) throw new Error("TAUX_INTERET_MAX_8");
    const { data: r } = await db.from("proxy_payment_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!r || r.payer_user_id !== context.userId) throw new Error("DEMANDE_INTROUVABLE");
    if (r.status !== "approved") throw new Error("APPROBATION_REQUISE");
    await db
      .from("proxy_payment_requests")
      .update({ reimbursement_requested: data.reimbursement, interest_rate: Math.round(rate * 100) / 100 })
      .eq("id", r.id);
    const { createAndCollect } = await import("@/lib/payments/collect.server");
    // The payer only pays the contribution — the debtor's penalty stays attached to the debtor.
    return createAndCollect({
      idempotencyKey: data.idempotencyKey,
      kind: r.kind === "contribution" ? "proxy_contribution" : "proxy_subscription",
      userId: context.userId,
      groupRef: r.tontine_id,
      dueRef: r.contribution_id ?? r.subscription_id,
      amount: Number(r.amount),
      currency: r.currency,
      msisdn: data.msisdn,
      description: "ZUKA PAY paiement pour un autre membre",
      dueDate: r.due_date,
      proxyRequestId: r.id,
    });
  });

export const payDebt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { debtId: string; amount: number; msisdn: string; idempotencyKey: string }) => d)
  .handler(async ({ data, context }) => {
    const { db } = await srv();
    const { data: d } = await db.from("member_debts").select("*").eq("id", data.debtId).maybeSingle();
    if (!d || d.debtor_user_id !== context.userId || d.status !== "active") throw new Error("LITIGE_INTROUVABLE");
    const amount = Math.min(Number(data.amount), Number(d.remaining_amount));
    if (!(amount > 0)) throw new Error("INVALID_AMOUNT");
    const { assertDisputePriority } = await import("./disputes.server");
    await assertDisputePriority(context.userId, { kind: "debt", id: d.id, since: String(d.created_at).slice(0, 10) });
    const { data: creditor } = await db.from("profiles").select("phone").eq("id", d.creditor_user_id).maybeSingle();
    const { createAndCollect } = await import("@/lib/payments/collect.server");
    return createAndCollect({
      idempotencyKey: data.idempotencyKey,
      kind: "debt_repayment",
      userId: context.userId,
      groupRef: d.tontine_id,
      amount,
      currency: d.currency,
      msisdn: data.msisdn,
      description: "ZUKA PAY remboursement d'avance",
      debtId: d.id,
      beneficiaryUserId: d.creditor_user_id,
      beneficiaryMsisdn: creditor?.phone ?? null,
    });
  });

export const setSecondAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string; memberId: string; permissions: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { requireGroupAdmin, db, logActivity, notify } = await srv();
    const admin = await requireGroupAdmin(data.tontineId, context.userId);
    const perms = data.permissions.filter((p) => (CO_ADMIN_PERMISSIONS as readonly string[]).includes(p));
    const { data: target } = await db
      .from("tontine_members")
      .select("id, name, user_id, status, role")
      .eq("id", data.memberId)
      .eq("tontine_id", data.tontineId)
      .maybeSingle();
    if (!target || target.status !== "active" || target.role === "admin") throw new Error("MEMBRE_INVALIDE");
    const { data: old } = await db.from("tontine_members").select("id").eq("tontine_id", data.tontineId).eq("role", "co_admin").maybeSingle();
    if (old && old.id !== target.id)
      await db.from("tontine_members").update({ role: "member", admin_permissions: [] }).eq("id", old.id);
    await db.from("tontine_members").update({ role: "co_admin", admin_permissions: perms }).eq("id", target.id);
    await db.from("tontines").update({ needs_second_admin: false, admin_last_active_at: new Date().toISOString() }).eq("id", data.tontineId);
    await db.from("group_admin_changes").insert({
      tontine_id: data.tontineId,
      old_principal: admin.id,
      new_principal: admin.id,
      old_second: old?.id ?? null,
      new_second: target.id,
      permissions: perms,
      trigger_action: "set_second_admin",
      reason: "Désignation du deuxième administrateur",
      actor_id: context.userId,
    });
    await logActivity(data.tontineId, context.userId, "group", `${target.name} est désigné deuxième administrateur.`);
    if (target.user_id)
      await notify({ userId: target.user_id, tontineId: data.tontineId, kind: "group", title: "Deuxième administrateur", body: "Vous êtes désormais deuxième administrateur du groupe." });
    return { ok: true };
  });

/** Voluntary hand-over: the second admin becomes principal; the former principal becomes a member. */
export const transferGroupManagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string }) => d)
  .handler(async ({ data, context }) => {
    const { requireGroupAdmin, db, logActivity } = await srv();
    const admin = await requireGroupAdmin(data.tontineId, context.userId);
    const { data: second } = await db
      .from("tontine_members")
      .select("id, name")
      .eq("tontine_id", data.tontineId)
      .eq("role", "co_admin")
      .eq("status", "active")
      .maybeSingle();
    if (!second) throw new Error("DEUXIEME_ADMIN_REQUIS");
    await db.from("tontine_members").update({ role: "admin", admin_permissions: [] }).eq("id", second.id);
    await db.from("tontine_members").update({ role: "member", admin_permissions: [] }).eq("id", admin.id);
    await db.from("tontines").update({ needs_second_admin: true, admin_last_active_at: new Date().toISOString() }).eq("id", data.tontineId);
    await db.from("group_admin_changes").insert({
      tontine_id: data.tontineId,
      old_principal: admin.id,
      new_principal: second.id,
      old_second: second.id,
      new_second: null,
      trigger_action: "voluntary_transfer",
      reason: "Transmission volontaire de la gestion du groupe",
      actor_id: context.userId,
    });
    await logActivity(data.tontineId, context.userId, "group", `${admin.name} a transmis la gestion du groupe à ${second.name}.`);
    return { ok: true };
  });
