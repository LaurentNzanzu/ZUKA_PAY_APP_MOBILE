import { supabaseAdmin } from "@/integrations/supabase/client.server";

const today = () => new Date().toISOString().slice(0, 10);

export type Dispute = {
  id: string;
  kind: "debt" | "contribution" | "subscription";
  label: string;
  groupName: string;
  tontineId: string;
  amount: number;
  currency: string;
  since: string;
  /** who receives the money */
  destination: string;
};

/**
 * Every active financial dispute of a user, across ALL groups (including
 * groups they left), oldest first. This is the priority order for payments.
 */
export async function listDisputes(userId: string): Promise<Dispute[]> {
  const db = supabaseAdmin as any;
  const out: Dispute[] = [];

  const { data: debts } = await db
    .from("member_debts")
    .select("id, tontine_id, reason, remaining_amount, currency, created_at, creditor_member_id, tontines(name), creditor:tontine_members!member_debts_creditor_member_id_fkey(name)")
    .eq("debtor_user_id", userId)
    .eq("status", "active");
  for (const d of debts ?? [])
    out.push({
      id: d.id,
      kind: "debt",
      label: d.reason,
      groupName: d.tontines?.name ?? "",
      tontineId: d.tontine_id,
      amount: Number(d.remaining_amount),
      currency: d.currency,
      since: String(d.created_at).slice(0, 10),
      destination: d.creditor?.name ?? "Créancier",
    });

  // Unpaid, past-due contributions in any group the user ever belonged to.
  const { data: members } = await db
    .from("tontine_members")
    .select("id, tontine_id, tontines(name, currency)")
    .eq("user_id", userId);
  const memberIds = (members ?? []).map((m: any) => m.id);
  if (memberIds.length) {
    const { data: contribs } = await db
      .from("contributions")
      .select("id, member_id, tontine_id, amount_due, amount_paid, contribution_periods!inner(due_date, beneficiary_member_id)")
      .in("member_id", memberIds)
      .lt("contribution_periods.due_date", today());
    // Excludes contributions whose shortfall is already covered by an approved/paid proxy payment.
    for (const c of contribs ?? []) {
      const rest = Number(c.amount_due) - Number(c.amount_paid);
      if (rest <= 0) continue;
      const m = (members ?? []).find((x: any) => x.id === c.member_id);
      out.push({
        id: c.id,
        kind: "contribution",
        label: "Ancienne cotisation impayée",
        groupName: m?.tontines?.name ?? "",
        tontineId: c.tontine_id,
        amount: rest,
        currency: m?.tontines?.currency ?? "USD",
        since: c.contribution_periods.due_date,
        destination: "Bénéficiaire de l'échéance",
      });
    }
    const { data: subs } = await db
      .from("group_subscriptions")
      .select("id, tontine_id, group_name, price_locked, currency, due_date")
      .in("payer_member_id", memberIds)
      .eq("status", "overdue");
    for (const s of subs ?? [])
      out.push({
        id: s.id,
        kind: "subscription",
        label: "Abonnement du groupe impayé",
        groupName: s.group_name,
        tontineId: s.tontine_id,
        amount: Number(s.price_locked),
        currency: s.currency,
        since: s.due_date,
        destination: "Compte ZUKA PAY (abonnements)",
      });
  }
  return out.sort((a, b) => a.since.localeCompare(b.since));
}

/**
 * Refuses a payment when an older dispute exists. `target` is the obligation
 * being paid; it is allowed only if it is the oldest open dispute (or none older).
 */
export async function assertDisputePriority(userId: string, target: { kind: Dispute["kind"]; id: string; since: string }) {
  const list = await listDisputes(userId);
  const blocking = list.find((d) => !(d.kind === target.kind && d.id === target.id) && d.since < target.since);
  const debt = list.find((d) => d.kind === "debt" && !(target.kind === "debt" && d.id === target.id));
  const first = debt && target.kind !== "debt" ? debt : blocking;
  if (first) throw new Error(`LITIGE_PRIORITAIRE:${first.label} — ${first.amount} ${first.currency}`);
}
