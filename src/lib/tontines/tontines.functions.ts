import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateDueDates, requiredVotes, addDays, todayISO } from "@/lib/zuki/engine";
import { assertGroupUsable, type PayerMode } from "./subscription.functions";
import type { Currency, DayMode, Frequency, Group, Threshold } from "@/lib/zuki/types";

async function srv() {
  return await import("./tontines.server");
}

export interface NewTontineInput {
  name: string;
  description?: string;
  currency: Currency;
  amount: number;
  frequency: Frequency;
  dayMode: DayMode;
  weekdays: number[];
  startDate: string;
  totalDues: number;
  maxMembers: number;
  groupType?: string;
  members: { name: string; phone: string }[];
  rules?: Partial<Group["rules"]>;
  reminders?: Partial<Group["reminders"]>;
  legacyRef?: string | null;
  latePenalty?: { enabled: boolean; amount: number };
  /** subscription payer mode chosen at creation (the admin is the first payer) */
  subscriptionMode?: PayerMode;
  /** legacy import: considered already launched */
  launched?: boolean;
  /** optional pre-credited amounts (used by the one-time local import) */
  credits?: { memberIndex: number; periodIndex: number; amount: number }[];
}

async function insertTontine(input: NewTontineInput, userId: string, ownerProfile: {
  name: string;
  phone: string;
}) {
  const { supabaseAdmin, logActivity, reassignBeneficiaryOrder } = await srv();

  const { data: tontine, error } = await supabaseAdmin
    .from("tontines")
    .insert({
      name: input.name,
      description: input.description ?? "",
      currency: input.currency,
      amount: input.amount,
      frequency: input.frequency,
      day_mode: input.dayMode,
      custom_days: input.weekdays ?? [],
      start_date: input.startDate,
      total_dues: input.totalDues,
      max_members: input.maxMembers,
      group_type: input.groupType ?? "family",
      created_by: userId,
      rules: (input.rules ?? {}) as never,
      reminders: (input.reminders ?? {}) as never,
      legacy_ref: input.legacyRef ?? null,
      late_penalty_enabled: Boolean(input.latePenalty?.enabled),
      late_penalty_amount: input.latePenalty?.enabled ? Number(input.latePenalty.amount) : 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const roster = input.members.length
    ? input.members
    : [{ name: ownerProfile.name, phone: ownerProfile.phone }];

  const memberRows = roster.map((m, i) => ({
    tontine_id: tontine.id,
    user_id: i === 0 ? userId : null,
    name: m.name,
    phone: m.phone,
    role: i === 0 ? "admin" : "member",
    position: i + 1,
    acceptance: i === 0 ? "accepted" : "pending",
  }));
  const { data: members, error: mErr } = await supabaseAdmin
    .from("tontine_members")
    .insert(memberRows)
    .select("*");
  if (mErr) throw new Error(mErr.message);
  const ordered = (members ?? []).sort((a, b) => a.position - b.position);

  const dates = generateDueDates({
    startDate: input.startDate,
    frequency: input.frequency,
    dayMode: input.dayMode,
    weekdays: input.weekdays ?? [],
    count: input.totalDues,
  });
  const periodRows = dates.map((date, i) => ({
    tontine_id: tontine.id,
    idx: i + 1,
    due_date: date,
    beneficiary_member_id: ordered[i % ordered.length]?.id ?? null,
  }));
  const { data: periods, error: pErr } = await supabaseAdmin
    .from("contribution_periods")
    .insert(periodRows)
    .select("*");
  if (pErr) throw new Error(pErr.message);
  const sortedPeriods = (periods ?? []).sort((a, b) => a.idx - b.idx);

  const credits = new Map<string, number>();
  for (const c of input.credits ?? [])
    credits.set(`${c.memberIndex}:${c.periodIndex}`, (credits.get(`${c.memberIndex}:${c.periodIndex}`) ?? 0) + c.amount);

  const contributionRows = sortedPeriods.flatMap((p, pi) =>
    ordered.map((m, mi) => {
      const paid = credits.get(`${mi}:${pi}`) ?? 0;
      return {
        tontine_id: tontine.id,
        period_id: p.id,
        member_id: m.id,
        amount_due: p.beneficiary_member_id === m.id ? 0 : input.amount,
        amount_paid: paid,
        status: paid <= 0 ? "pending" : paid >= input.amount ? "paid" : "partial",
      };
    }),
  );
  if (contributionRows.length) {
    const { error: cErr } = await supabaseAdmin.from("contributions").insert(contributionRows);
    if (cErr) throw new Error(cErr.message);
  }

  const adminMember = ordered[0];
  await supabaseAdmin
    .from("tontines")
    .update({
      sub_payer_mode: input.subscriptionMode ?? (input.launched ? "same" : null),
      sub_payer_order: adminMember && (input.subscriptionMode || input.launched) ? [adminMember.id] : [],
      launched_at: input.launched ? new Date().toISOString() : null,
    } as never)
    .eq("id", tontine.id);
  await supabaseAdmin.rpc("sync_group_subscription" as never, { _tontine_id: tontine.id } as never);

  await reassignBeneficiaryOrder(tontine.id);
  await logActivity(tontine.id, userId, "group", `Tontine créée par ${ordered[0]?.name ?? "un membre"}.`);
  return tontine.id as string;
}

async function profileOf(userId: string) {
  const { supabaseAdmin } = await srv();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", userId)
    .maybeSingle();
  return {
    name: data?.full_name ?? data?.email ?? "Moi",
    phone: data?.phone ?? "",
  };
}

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, assembleGroups } = await srv();
    const claims = context.claims as { email?: string; phone?: string } | null;
    await supabaseAdmin.from("profiles").upsert(
      {
        id: context.userId,
        ...(claims?.email ? { email: claims.email } : {}),
        ...(claims?.phone ? { phone: claims.phone } : {}),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    const { data: mine } = await supabaseAdmin
      .from("tontine_members")
      .select("tontine_id")
      .eq("user_id", context.userId)
      .eq("status", "active");
    const { data: owned } = await supabaseAdmin
      .from("tontines")
      .select("id")
      .eq("created_by", context.userId);
    const ids = Array.from(
      new Set([...(mine ?? []).map((m) => m.tontine_id), ...(owned ?? []).map((t) => t.id)]),
    );
    const groups = await assembleGroups(ids, context.userId);
    const { data: me } = await supabaseAdmin
      .from("tontine_members")
      .select("id, tontine_id")
      .eq("user_id", context.userId);
    return {
      groups,
      memberIds: Object.fromEntries((me ?? []).map((m) => [m.tontine_id, m.id])),
      profile: await profileOf(context.userId),
    };
  });

export const createTontine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: NewTontineInput) => d)
  .handler(async ({ data, context }) => {
    if (!data.name?.trim()) throw new Error("NOM_REQUIS");
    if (!(data.amount > 0)) throw new Error("MONTANT_INVALIDE");
    if (!(data.totalDues > 0) || data.totalDues > 400) throw new Error("ECHEANCES_INVALIDES");
    if (data.latePenalty?.enabled && !(Number(data.latePenalty.amount) > 0))
      throw new Error("PENALITE_INVALIDE");
    if (!data.subscriptionMode) throw new Error("CONFIG_ABONNEMENT_REQUISE");
    const id = await insertTontine({ ...data, launched: false }, context.userId, await profileOf(context.userId));
    return { id };
  });

/** One-time migration of data created before the backend existed. */
export const importLegacyGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groups: Group[]; currentUserId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await srv();
    const profile = await profileOf(context.userId);
    let imported = 0;
    for (const g of data.groups.slice(0, 20)) {
      const { data: existing } = await supabaseAdmin
        .from("tontines")
        .select("id")
        .eq("created_by", context.userId)
        .eq("legacy_ref", g.id)
        .maybeSingle();
      if (existing) continue;

      // The local device user always becomes the first (admin) member.
      const localMembers = [...g.members].sort((a, b) =>
        a.id === data.currentUserId ? -1 : b.id === data.currentUserId ? 1 : 0,
      );
      const memberIndex = new Map(localMembers.map((m, i) => [m.id, i]));
      const periodIndex = new Map(g.dues.map((d, i) => [d.id, i]));
      const credits = g.transactions
        .filter((t) => t.status === "SUCCESS")
        .map((t) => ({
          memberIndex: memberIndex.get(t.memberId) ?? -1,
          periodIndex: periodIndex.get(t.dueId) ?? -1,
          amount: t.amount,
        }))
        .filter((c) => c.memberIndex >= 0 && c.periodIndex >= 0);

      await insertTontine(
        {
          name: g.name,
          description: g.description,
          currency: g.currency,
          amount: g.amount,
          frequency: g.frequency,
          dayMode: g.dayMode,
          weekdays: g.weekdays,
          startDate: g.startDate,
          totalDues: g.totalDues || g.dues.length || 12,
          maxMembers: g.maxMembers,
          members: localMembers.map((m, i) => ({
            name: i === 0 ? m.name || profile.name : m.name,
            phone: m.phone,
          })),
          rules: g.rules,
          reminders: g.reminders,
          legacyRef: g.id,
          launched: true,
          credits,
        },
        context.userId,
        profile,
      );
      imported += 1;
    }
    return { imported };
  });

export const requestSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; targetMemberId: string; direction: "earlier" | "later" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember, logActivity, notify } = await srv();
    const me = await requireMember(data.groupId, context.userId);
    await assertGroupUsable(data.groupId);
    const { data: target } = await supabaseAdmin
      .from("tontine_members")
      .select("*")
      .eq("id", data.targetMemberId)
      .eq("tontine_id", data.groupId)
      .maybeSingle();
    if (!target) throw new Error("MEMBRE_INTROUVABLE");
    if (target.id === me.id) throw new Error("ECHANGE_IMPOSSIBLE");

    const { error } = await supabaseAdmin.from("beneficiary_swaps").insert({
      tontine_id: data.groupId,
      from_member_id: me.id,
      to_member_id: target.id,
      from_position: me.position,
      to_position: target.position,
      direction: data.direction,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    await logActivity(
      data.groupId,
      context.userId,
      "swap",
      `${me.name} a demandé à recevoir ${data.direction === "earlier" ? "plus tôt" : "plus tard"} en échangeant avec ${target.name}.`,
    );
    if (target.user_id)
      await notify({
        userId: target.user_id,
        tontineId: data.groupId,
        kind: "swap_requested",
        title: "Échange de tour demandé",
        body: `${me.name} vous propose d'échanger vos tours.`,
      });
    return { ok: true };
  });

export const resolveSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; swapId: string; accept: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember, logActivity, reassignBeneficiaryOrder, notify } = await srv();
    const me = await requireMember(data.groupId, context.userId);
    const { data: swap } = await supabaseAdmin
      .from("beneficiary_swaps")
      .select("*")
      .eq("id", data.swapId)
      .eq("tontine_id", data.groupId)
      .maybeSingle();
    if (!swap || swap.status !== "pending") throw new Error("ECHANGE_INTROUVABLE");
    if (swap.to_member_id !== me.id && me.role !== "admin") throw new Error("FORBIDDEN");

    const { data: members } = await supabaseAdmin
      .from("tontine_members")
      .select("*")
      .eq("tontine_id", data.groupId);
    const from = (members ?? []).find((m) => m.id === swap.from_member_id);
    const to = (members ?? []).find((m) => m.id === swap.to_member_id);
    if (!from || !to) throw new Error("MEMBRE_INTROUVABLE");

    if (!data.accept) {
      await supabaseAdmin.from("beneficiary_swaps").update({ status: "refused" }).eq("id", swap.id);
      await logActivity(data.groupId, context.userId, "swap", `${to.name} a refusé l'échange de tour avec ${from.name}.`);
      if (from.user_id)
        await notify({
          userId: from.user_id,
          tontineId: data.groupId,
          kind: "swap_refused",
          title: "Échange refusé",
          body: `${to.name} a refusé l'échange de tour.`,
        });
      return { ok: true, status: "refused" };
    }

    const { data: tontine } = await supabaseAdmin
      .from("tontines")
      .select("rules")
      .eq("id", data.groupId)
      .maybeSingle();
    const rules = (tontine?.rules ?? {}) as { swapNeedsVote?: boolean; threshold?: Threshold };

    if (rules.swapNeedsVote) {
      const { data: vote, error } = await supabaseAdmin
        .from("group_votes")
        .insert({
          tontine_id: data.groupId,
          title: `Échange de tour : ${from.name} ↔ ${to.name}`,
          description: `${from.name} (place ${swap.from_position}) et ${to.name} (place ${swap.to_position}) sont d'accord pour échanger leur tour. Le groupe doit valider.`,
          deadline: addDays(todayISO(), 3),
          threshold: rules.threshold ?? "simple",
          status: "open",
          created_by: context.userId,
          swap_id: swap.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin
        .from("beneficiary_swaps")
        .update({ status: "awaiting_vote", vote_id: vote.id })
        .eq("id", swap.id);
      await logActivity(
        data.groupId,
        context.userId,
        "swap",
        `${to.name} a accepté l'échange avec ${from.name}. Le groupe doit maintenant voter.`,
      );
      return { ok: true, status: "awaiting_vote" };
    }

    await applySwapPositions(data.groupId, from.id, to.id);
    await supabaseAdmin.from("beneficiary_swaps").update({ status: "accepted" }).eq("id", swap.id);
    await reassignBeneficiaryOrder(data.groupId);
    await logActivity(
      data.groupId,
      context.userId,
      "swap",
      `${from.name} et ${to.name} ont échangé leurs tours.`,
    );
    return { ok: true, status: "accepted" };
  });

async function applySwapPositions(tontineId: string, a: string, b: string) {
  const { supabaseAdmin } = await srv();
  const { data: rows } = await supabaseAdmin
    .from("tontine_members")
    .select("id, position")
    .in("id", [a, b]);
  const ra = (rows ?? []).find((r) => r.id === a);
  const rb = (rows ?? []).find((r) => r.id === b);
  if (!ra || !rb) return;
  await supabaseAdmin.from("tontine_members").update({ position: rb.position }).eq("id", a);
  await supabaseAdmin.from("tontine_members").update({ position: ra.position }).eq("id", b);
  void tontineId;
}

export const setAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; answer: "accepted" | "refused" | "pending" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember, logActivity } = await srv();
    const me = await requireMember(data.groupId, context.userId);
    await supabaseAdmin.from("tontine_members").update({ acceptance: data.answer }).eq("id", me.id);
    await logActivity(
      data.groupId,
      context.userId,
      "contract",
      data.answer === "accepted"
        ? `${me.name} a accepté les règles de la tontine.`
        : `${me.name} a refusé les règles de la tontine.`,
    );
    return { ok: true };
  });

export const createVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      groupId: string;
      title: string;
      description: string;
      deadline: string;
      threshold: Threshold;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember, logActivity } = await srv();
    const me = await requireMember(data.groupId, context.userId);
    await assertGroupUsable(data.groupId);
    if (!data.title.trim()) throw new Error("TITRE_REQUIS");
    const { error } = await supabaseAdmin.from("group_votes").insert({
      tontine_id: data.groupId,
      title: data.title,
      description: data.description,
      deadline: data.deadline,
      threshold: data.threshold,
      status: "open",
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logActivity(data.groupId, context.userId, "vote", `${me.name} a lancé un vote : « ${data.title} ».`);
    return { ok: true };
  });

export const castVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; voteId: string; answer: "yes" | "no" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireMember, logActivity, reassignBeneficiaryOrder } = await srv();
    const me = await requireMember(data.groupId, context.userId);
    await assertGroupUsable(data.groupId);
    const { data: vote } = await supabaseAdmin
      .from("group_votes")
      .select("*")
      .eq("id", data.voteId)
      .eq("tontine_id", data.groupId)
      .maybeSingle();
    if (!vote || vote.status !== "open") throw new Error("VOTE_CLOS");

    await supabaseAdmin
      .from("vote_responses")
      .upsert(
        { vote_id: vote.id, member_id: me.id, answer: data.answer },
        { onConflict: "vote_id,member_id" },
      );

    const { data: responses } = await supabaseAdmin
      .from("vote_responses")
      .select("answer")
      .eq("vote_id", vote.id);
    const { count } = await supabaseAdmin
      .from("tontine_members")
      .select("id", { count: "exact", head: true })
      .eq("tontine_id", data.groupId)
      .eq("status", "active");
    const total = count ?? 1;
    const yes = (responses ?? []).filter((r) => r.answer === "yes").length;
    const no = (responses ?? []).filter((r) => r.answer === "no").length;
    const needed = requiredVotes(total, vote.threshold as Threshold);
    const decided = yes >= needed ? "approved" : no > total - needed ? "rejected" : "open";

    if (decided !== "open") {
      await supabaseAdmin.from("group_votes").update({ status: decided }).eq("id", vote.id);
      if (vote.swap_id) {
        const { data: swap } = await supabaseAdmin
          .from("beneficiary_swaps")
          .select("*")
          .eq("id", vote.swap_id)
          .maybeSingle();
        if (swap && swap.status === "awaiting_vote") {
          if (decided === "approved") {
            await applySwapPositions(data.groupId, swap.from_member_id, swap.to_member_id);
            await reassignBeneficiaryOrder(data.groupId);
            await supabaseAdmin.from("beneficiary_swaps").update({ status: "accepted" }).eq("id", swap.id);
            await logActivity(data.groupId, null, "swap", "Le groupe a validé l'échange de tour.");
          } else {
            await supabaseAdmin.from("beneficiary_swaps").update({ status: "refused" }).eq("id", swap.id);
            await logActivity(data.groupId, null, "swap", "Le groupe a rejeté l'échange de tour.");
          }
        }
      }
      await logActivity(
        data.groupId,
        null,
        "vote",
        `Vote « ${vote.title} » ${decided === "approved" ? "approuvé" : "rejeté"}.`,
      );
    }
    return { ok: true, status: decided };
  });

export const setReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; reminders: Group["reminders"] }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin } = await srv();
    await requireGroupAdmin(data.groupId, context.userId);
    await supabaseAdmin
      .from("tontines")
      .update({ reminders: data.reminders as never })
      .eq("id", data.groupId);
    return { ok: true };
  });

export const setLatePenalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; enabled: boolean; amount: number }) => {
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) throw new Error("PENALITE_INVALIDE");
    if (d.enabled && amount <= 0) throw new Error("PENALITE_INVALIDE");
    return { groupId: String(d.groupId), enabled: Boolean(d.enabled), amount };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity } = await srv();
    const admin = await requireGroupAdmin(data.groupId, context.userId);
    const { data: before } = await supabaseAdmin
      .from("tontines")
      .select("currency, late_penalty_enabled, late_penalty_amount")
      .eq("id", data.groupId)
      .single();
    const next = { late_penalty_enabled: data.enabled, late_penalty_amount: data.enabled ? data.amount : 0 };
    const { error } = await supabaseAdmin.from("tontines").update(next).eq("id", data.groupId);
    if (error) throw new Error(error.message);
    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: prof?.email ?? null,
      action: "tontine.late_penalty.update",
      entity_type: "tontine",
      entity_id: data.groupId,
      old_value: before
        ? { enabled: before.late_penalty_enabled, amount: Number(before.late_penalty_amount), currency: before.currency }
        : null,
      new_value: { enabled: next.late_penalty_enabled, amount: next.late_penalty_amount, currency: before?.currency },
      result: "success",
    });
    await logActivity(
      data.groupId,
      context.userId,
      "settings",
      data.enabled
        ? `${admin.name} a fixé la pénalité de retard à ${data.amount} ${before?.currency ?? ""}.`
        : `${admin.name} a désactivé la pénalité de retard.`,
    );
    return { ok: true };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; name: string; phone: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity, reassignBeneficiaryOrder } = await srv();
    await requireGroupAdmin(data.groupId, context.userId);
    const { data: tontine } = await supabaseAdmin
      .from("tontines")
      .select("max_members, amount")
      .eq("id", data.groupId)
      .maybeSingle();
    const { data: members } = await supabaseAdmin
      .from("tontine_members")
      .select("id, position")
      .eq("tontine_id", data.groupId)
      .eq("status", "active");
    if (tontine && (members?.length ?? 0) >= tontine.max_members) throw new Error("GROUPE_COMPLET");

    const position = Math.max(0, ...(members ?? []).map((m) => m.position)) + 1;
    const { data: inserted, error } = await supabaseAdmin
      .from("tontine_members")
      .insert({
        tontine_id: data.groupId,
        name: data.name,
        phone: data.phone,
        role: "member",
        position,
        acceptance: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: periods } = await supabaseAdmin
      .from("contribution_periods")
      .select("id")
      .eq("tontine_id", data.groupId);
    if (periods?.length && tontine)
      await supabaseAdmin.from("contributions").insert(
        periods.map((p) => ({
          tontine_id: data.groupId,
          period_id: p.id,
          member_id: inserted.id,
          amount_due: tontine.amount,
          amount_paid: 0,
          status: "pending",
        })),
      );
    await reassignBeneficiaryOrder(data.groupId);
    await logActivity(data.groupId, context.userId, "member", `${data.name} a été invité(e) dans la tontine.`);
    return { ok: true };
  });

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await srv();
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("id, kind, title, body, read_at, created_at, tontine_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await srv();
    const q = supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (data.id) await q.eq("id", data.id);
    else await q;
    return { ok: true };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name?: string; phone?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await srv();
    const patch: { full_name?: string; phone?: string } = {};
    if (data.name !== undefined) patch.full_name = data.name.slice(0, 80);
    if (data.phone !== undefined) patch.phone = data.phone.slice(0, 30);
    if (Object.keys(patch).length) {
      await supabaseAdmin.from("profiles").upsert({ id: context.userId, ...patch }, { onConflict: "id" });
      const memberPatch: { name?: string; phone?: string } = {};
      if (data.name !== undefined) memberPatch.name = data.name.slice(0, 80);
      if (data.phone !== undefined) memberPatch.phone = data.phone.slice(0, 30);
      await supabaseAdmin.from("tontine_members").update(memberPatch).eq("user_id", context.userId);
    }
    return { ok: true };
  });
