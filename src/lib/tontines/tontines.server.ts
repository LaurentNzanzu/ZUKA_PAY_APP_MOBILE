import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Group, Member, Transaction, TxStatus } from "@/lib/zuki/types";
import { defaultReminders, defaultRules } from "@/lib/zuki/engine";

export { supabaseAdmin };

export type Row = Record<string, unknown>;

export async function memberRow(tontineId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("tontine_members")
    .select("*")
    .eq("tontine_id", tontineId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function requireMember(tontineId: string, userId: string) {
  const m = await memberRow(tontineId, userId);
  if (!m || m.status !== "active") throw new Error("FORBIDDEN");
  return m;
}

export async function requireGroupAdmin(tontineId: string, userId: string) {
  const m = await requireMember(tontineId, userId);
  if (m.role !== "admin") throw new Error("FORBIDDEN");
  // Significant admin action: resets the 6-month inactivity counter.
  await (supabaseAdmin as any)
    .from("tontines")
    .update({ admin_last_active_at: new Date().toISOString() })
    .eq("id", tontineId);
  return m;
}

export async function logActivity(
  tontineId: string,
  actorId: string | null,
  kind: string,
  message: string,
) {
  await supabaseAdmin.from("group_activity").insert({
    tontine_id: tontineId,
    actor_id: actorId,
    kind,
    message,
  });
}

export async function notify(input: {
  userId: string;
  tontineId?: string | null;
  kind: string;
  title: string;
  body: string;
  dedupeKey?: string | null;
}) {
  await supabaseAdmin.from("notifications").insert({
    user_id: input.userId,
    tontine_id: input.tontineId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    channel: "in_app",
    status: "sent",
    sent_at: new Date().toISOString(),
    dedupe_key: input.dedupeKey ?? null,
  });
}

/** Re-points every period at the member whose position matches its rank. */
export async function reassignBeneficiaryOrder(tontineId: string) {
  const { data: members } = await supabaseAdmin
    .from("tontine_members")
    .select("id, position")
    .eq("tontine_id", tontineId)
    .eq("status", "active")
    .order("position", { ascending: true });
  const { data: periods } = await supabaseAdmin
    .from("contribution_periods")
    .select("id, idx")
    .eq("tontine_id", tontineId)
    .order("idx", { ascending: true });
  const ordered = members ?? [];
  if (!ordered.length || !periods?.length) return;
  for (const p of periods) {
    const target = ordered[(p.idx - 1) % ordered.length];
    if (target)
      await supabaseAdmin
        .from("contribution_periods")
        .update({ beneficiary_member_id: target.id })
        .eq("id", p.id);
  }
}

/** Rebuilds the client-side Group shape from the relational tables. */
export async function assembleGroups(tontineIds: string[], userId: string): Promise<Group[]> {
  if (!tontineIds.length) return [];
  const [tontines, members, periods, contributions, swaps, votes, responses, activity, txs, penalties] =
    await Promise.all([
      supabaseAdmin.from("tontines").select("*").in("id", tontineIds),
      supabaseAdmin.from("tontine_members").select("*").in("tontine_id", tontineIds),
      supabaseAdmin.from("contribution_periods").select("*").in("tontine_id", tontineIds),
      supabaseAdmin.from("contributions").select("*").in("tontine_id", tontineIds),
      supabaseAdmin.from("beneficiary_swaps").select("*").in("tontine_id", tontineIds),
      supabaseAdmin.from("group_votes").select("*").in("tontine_id", tontineIds),
      supabaseAdmin.from("vote_responses").select("*"),
      supabaseAdmin
        .from("group_activity")
        .select("*")
        .in("tontine_id", tontineIds)
        .order("created_at", { ascending: false })
        .limit(400),
      supabaseAdmin.from("payment_transactions").select("*").in("group_ref", tontineIds),
      supabaseAdmin.from("late_penalties").select("*").in("tontine_id", tontineIds),
    ]);

  const byGroup = <T extends { tontine_id: string }>(rows: T[] | null, id: string) =>
    (rows ?? []).filter((r) => r.tontine_id === id);

  return (tontines.data ?? []).map((t) => {
    const gMembers = byGroup(members.data, t.id)
      .filter((m) => m.status === "active")
      .sort((a, b) => a.position - b.position);
    const gPeriods = byGroup(periods.data, t.id).sort((a, b) => a.idx - b.idx);
    const gContribs = byGroup(contributions.data, t.id);
    const memberIdByUser = new Map(gMembers.filter((m) => m.user_id).map((m) => [m.user_id, m.id]));
    // The UI identifies the signed-in member with a stable id across groups.
    const self = gMembers.find((m) => m.user_id === userId)?.id;
    const aid = (id: string) => (self && id === self ? "me" : id);

    const realTx: Transaction[] = (txs.data ?? [])
      .filter((x) => x.group_ref === t.id)
      .map((x) => ({
        id: x.id,
        ref: x.reference,
        groupId: t.id,
        dueId: x.due_ref ?? "",
        memberId: aid((x.member_id ? memberIdByUser.get(x.member_id) : undefined) ?? x.member_id ?? ""),
        amount: Number(x.amount),
        currency: x.currency as Group["currency"],
        msisdn: x.msisdn ?? "",
        status: x.status as TxStatus,
        createdAt: x.created_at,
        contributionAmount: x.contribution_amount == null ? Number(x.amount) : Number(x.contribution_amount),
        penaltyAmount: Number(x.penalty_amount ?? 0),
        dueDate: x.due_date ?? undefined,
        daysLate: x.days_late ?? 0,
      }));

    // Amounts credited without a live Mobile Money transaction (imported or
    // manually recorded) are surfaced as a single settled entry so the
    // tracking table always matches the ledger.
    const synthetic: Transaction[] = [];
    for (const c of gContribs) {
      const paid = Number(c.amount_paid);
      if (paid <= 0) continue;
      const covered = realTx
        .filter((x) => x.dueId === c.period_id && x.memberId === aid(c.member_id) && x.status === "SUCCESS")
        .reduce((s, x) => s + (x.contributionAmount ?? x.amount), 0);
      const rest = paid - covered;
      if (rest > 0.0001)
        synthetic.push({
          id: `c-${c.id}`,
          ref: `LEDGER-${String(c.id).slice(0, 8).toUpperCase()}`,
          groupId: t.id,
          dueId: c.period_id,
          memberId: aid(c.member_id),
          amount: rest,
          currency: t.currency as Group["currency"],
          msisdn: "",
          status: "SUCCESS",
          createdAt: c.updated_at,
        });
    }

    const gVotes = byGroup(votes.data, t.id);
    const acceptances: Group["acceptances"] = {};
    for (const m of gMembers) acceptances[aid(m.id)] = m.acceptance as Group["acceptances"][string];

    const group: Group = {
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      currency: t.currency as Group["currency"],
      maxMembers: t.max_members,
      amount: Number(t.amount),
      frequency: t.frequency as Group["frequency"],
      dayMode: t.day_mode as Group["dayMode"],
      weekdays: t.custom_days ?? [],
      startDate: t.start_date,
      totalDues: t.total_dues,
      members: gMembers.map(
        (m): Member => ({
          id: aid(m.id),
          name: m.name,
          phone: m.phone,
          role: m.role as Member["role"],
        }),
      ),
      order: gMembers.map((m) => aid(m.id)),
      dues: gPeriods.map((p) => ({
        id: p.id,
        index: p.idx,
        date: p.due_date,
        beneficiaryId: aid(p.beneficiary_member_id ?? ""),
      })),
      transactions: [...realTx, ...synthetic],
      swaps: byGroup(swaps.data, t.id).map((s) => ({
        id: s.id,
        fromMemberId: aid(s.from_member_id),
        toMemberId: aid(s.to_member_id),
        fromPosition: s.from_position,
        toPosition: s.to_position,
        direction: s.direction as "earlier" | "later",
        status: s.status as "pending" | "awaiting_vote" | "accepted" | "refused",
        ...(s.vote_id ? { voteId: s.vote_id } : {}),
        createdAt: s.created_at,
      })),
      votes: gVotes.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description ?? "",
        deadline: v.deadline,
        threshold: v.threshold as Group["rules"]["threshold"],
        status: v.status as "open" | "approved" | "rejected",
        createdBy: v.created_by ?? "",
        createdAt: v.created_at,
        responses: (responses.data ?? [])
          .filter((r) => r.vote_id === v.id)
          .map((r) => ({
            memberId: aid(r.member_id),
            answer: r.answer as "yes" | "no",
            at: r.created_at,
          })),
        ...(v.swap_id ? { swapId: v.swap_id } : {}),
      })),
      logs: byGroup(activity.data, t.id).map((a) => ({
        id: a.id,
        at: a.created_at,
        text: a.message,
      })),
      rules: { ...defaultRules(), ...((t.rules ?? {}) as object) },
      reminders: { ...defaultReminders(), ...((t.reminders ?? {}) as object) },
      acceptances,
      latePenalty: {
        enabled: Boolean(t.late_penalty_enabled),
        amount: Number(t.late_penalty_amount ?? 0),
      },
      penalties: byGroup(penalties.data, t.id).map((p) => ({
        dueId: p.period_id,
        memberId: aid(p.member_id),
        amount: Number(p.amount),
        status: p.status as "applied" | "paid" | "waived",
        daysLate: p.days_late,
      })),
    };
    return group;
  });
}
