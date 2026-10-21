import { currentLang, pick } from "@/lib/i18n";
import type {
  ContractRules,
  ContributionStatus,
  Currency,
  DayMode,
  Due,
  Frequency,
  Group,
  HealthLevel,
  Reminders,
  Threshold,
  Vote,
} from "./types";

export const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const parseISO = (s: string) => new Date(`${s}T12:00:00`);
export const todayISO = () => toISO(new Date());

export function addDays(iso: string, n: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number) {
  const d = parseISO(iso);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

export function activeWeekdays(dayMode: DayMode, weekdays: number[]) {
  if (dayMode === "all") return [0, 1, 2, 3, 4, 5, 6];
  if (dayMode === "weekdays") return [1, 2, 3, 4, 5];
  return weekdays.length ? weekdays : [1, 2, 3, 4, 5, 6];
}

/** Generates one due date per contribution deadline, honoring the frequency rules. */
export function generateDueDates(opts: {
  startDate: string;
  frequency: Frequency;
  dayMode: DayMode;
  weekdays: number[];
  count: number;
}): string[] {
  const { startDate, frequency, count } = opts;
  const dates: string[] = [];
  if (frequency === "monthly") {
    for (let i = 0; i < count; i++) dates.push(addMonths(startDate, i));
    return dates;
  }
  if (frequency === "weekly") {
    for (let i = 0; i < count; i++) dates.push(addDays(startDate, i * 7));
    return dates;
  }
  const allowed = activeWeekdays(opts.dayMode, opts.weekdays);
  let cursor = startDate;
  let guard = 0;
  while (dates.length < count && guard < count * 20 + 400) {
    if (allowed.includes(parseISO(cursor).getDay())) dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard++;
  }
  return dates;
}

export function buildDues(opts: {
  startDate: string;
  frequency: Frequency;
  dayMode: DayMode;
  weekdays: number[];
  count: number;
  order: string[];
  idPrefix: string;
}): Due[] {
  return generateDueDates(opts).map((date, i) => ({
    id: `${opts.idPrefix}-d${i + 1}`,
    index: i + 1,
    date,
    beneficiaryId: opts.order[i % opts.order.length] ?? opts.order[0]!,
  }));
}

/** Re-assign beneficiaries after a turn swap so the simulation stays in sync. */
export function reassignBeneficiaries(dues: Due[], order: string[]): Due[] {
  return dues.map((d, i) => ({ ...d, beneficiaryId: order[i % order.length] ?? order[0]! }));
}

export function paidBy(group: Group, dueId: string, memberId: string) {
  return group.transactions
    .filter((t) => t.dueId === dueId && t.memberId === memberId && t.status === "SUCCESS")
    .reduce((s, t) => s + (t.contributionAmount ?? t.amount), 0);
}

export function statusFor(group: Group, dueId: string, memberId: string): ContributionStatus {
  const due = group.dues.find((d) => d.id === dueId);
  const paid = paidBy(group, dueId, memberId);
  if (paid >= group.amount) return "paid";
  if (!due) return "pending";
  const overdue = due.date < todayISO();
  if (paid > 0) return overdue || due.date === todayISO() ? "partial" : "partial";
  return overdue ? "late" : "pending";
}

export function collectedFor(group: Group, dueId: string) {
  return group.transactions
    .filter((t) => t.dueId === dueId && t.status === "SUCCESS")
    .reduce((s, t) => s + (t.contributionAmount ?? t.amount), 0);
}

/**
 * Late penalty the member still owes for a period (display only — the server
 * recomputes and enforces it). 0 when paid on time or the penalty is off.
 */
export function penaltyFor(group: Group, dueId: string, memberId: string) {
  const due = group.dues.find((d) => d.id === dueId);
  if (!due) return { amount: 0, daysLate: 0 };
  const daysLate = Math.max(
    0,
    Math.round((Date.parse(todayISO()) - Date.parse(due.date)) / 86_400_000),
  );
  if (paidBy(group, dueId, memberId) >= group.amount) return { amount: 0, daysLate };
  const record = group.penalties?.find((p) => p.dueId === dueId && p.memberId === memberId);
  if (record) return { amount: record.status === "applied" ? record.amount : 0, daysLate };
  const lp = group.latePenalty;
  if (daysLate <= 0 || !lp?.enabled || lp.amount <= 0) return { amount: 0, daysLate };
  return { amount: lp.amount, daysLate };
}

export function potFor(group: Group) {
  return group.amount * group.members.length;
}

export function currentDue(group: Group): Due | undefined {
  const today = todayISO();
  return group.dues.find((d) => d.date >= today) ?? group.dues[group.dues.length - 1];
}

export function nextDueForMember(group: Group, memberId: string) {
  const today = todayISO();
  return group.dues.find((d) => d.date >= today && statusFor(group, d.id, memberId) !== "paid");
}

export function remainingDues(group: Group) {
  const today = todayISO();
  return group.dues.filter((d) => d.date >= today).length;
}

export function positionOf(group: Group, memberId: string) {
  return group.order.indexOf(memberId) + 1;
}

export function turnDateOf(group: Group, memberId: string) {
  const pos = positionOf(group, memberId);
  return group.dues.find((d) => d.index === pos)?.date;
}

export function memberOf(group: Group, id: string) {
  return group.members.find((m) => m.id === id);
}

export function groupTotals(group: Group, dueId: string) {
  const expected = potFor(group);
  const collected = collectedFor(group, dueId);
  const upToDate = group.members.filter((m) => statusFor(group, dueId, m.id) === "paid").length;
  const late = group.members.filter((m) => statusFor(group, dueId, m.id) === "late").length;
  return { expected, collected, remaining: Math.max(expected - collected, 0), upToDate, late };
}

export function paymentRef(seq: number, date = new Date()) {
  const stamp = toISO(date).replace(/-/g, "");
  return `ZKA-PAY-${stamp}-${String(seq).padStart(6, "0")}`;
}

export function subscriptionTier(memberCount: number) {
  if (memberCount <= 5) return { key: "small", price: 3 } as const;
  if (memberCount <= 15) return { key: "medium", price: 7 } as const;
  if (memberCount <= 30) return { key: "large", price: 15 } as const;
  return { key: "big", price: 25 } as const;
}

export function formatMoney(amount: number, currency: Currency) {
  const value = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: currency === "USD" && !Number.isInteger(amount) ? 2 : 0,
  }).format(amount);
  return `${value} ${currency}`;
}

/* ============================================================
 * ZUKA PAY SIMULATOR — pure business logic, no UI, no storage.
 * ============================================================ */

export interface SimulationInput {
  members: number;
  amount: number;
  frequency: Frequency;
  dayMode: DayMode;
  weekdays: number[];
  startDate: string;
  /** number of full cycles (each cycle = one turn per member) */
  cycles: number;
  currency: Currency;
}

export interface SimulationRow {
  index: number;
  date: string;
  /** 1-based position of the beneficiary in the turn order */
  position: number;
  pot: number;
}

export interface SimulationResult {
  rows: SimulationRow[];
  /** pot handed to one beneficiary at each due date */
  potPerCycle: number;
  /** total each member will contribute over the whole tontine */
  totalPerMember: number;
  dueCount: number;
  firstDate: string;
  lastDate: string;
  /** total duration in days */
  durationDays: number;
}

export function simulate(input: SimulationInput): SimulationResult {
  const members = Math.max(2, Math.min(input.members, 60));
  const count = Math.max(1, members * Math.max(1, input.cycles));
  const dates = generateDueDates({
    startDate: input.startDate,
    frequency: input.frequency,
    dayMode: input.dayMode,
    weekdays: input.weekdays,
    count,
  });
  const potPerCycle = input.amount * members;
  const rows: SimulationRow[] = dates.map((date, i) => ({
    index: i + 1,
    date,
    position: (i % members) + 1,
    pot: potPerCycle,
  }));
  const first = dates[0] ?? input.startDate;
  const last = dates[dates.length - 1] ?? input.startDate;
  const durationDays = Math.round(
    (parseISO(last).getTime() - parseISO(first).getTime()) / 86_400_000,
  );
  return {
    rows,
    potPerCycle,
    totalPerMember: input.amount * count,
    dueCount: count,
    firstDate: first,
    lastDate: last,
    durationDays,
  };
}

/* ============================================================
 * ZUKA PAY GROUP HEALTH — indicative only, never a financial guarantee.
 * ============================================================ */

export interface Health {
  level: HealthLevel;
  onTimeRate: number;
  lateCount: number;
  pendingCount: number;
  activeMembers: number;
}

export function groupHealth(group: Group): Health {
  const today = todayISO();
  const past = group.dues.filter((d) => d.date <= today);
  let expectedSlots = 0;
  let paidSlots = 0;
  let lateCount = 0;
  let pendingCount = 0;

  for (const d of past) {
    for (const m of group.members) {
      expectedSlots++;
      const s = statusFor(group, d.id, m.id);
      if (s === "paid") paidSlots++;
      else if (s === "late") lateCount++;
      else pendingCount++;
    }
  }

  const activeMembers = group.members.filter((m) =>
    group.transactions.some((t) => t.memberId === m.id && t.status === "SUCCESS"),
  ).length;

  const onTimeRate = expectedSlots ? Math.round((paidSlots / expectedSlots) * 100) : 100;
  const level: HealthLevel = onTimeRate >= 85 ? "stable" : onTimeRate >= 60 ? "watch" : "alert";
  return { level, onTimeRate, lateCount, pendingCount, activeMembers };
}

/* ============================================================
 * VOTES
 * ============================================================ */

export function requiredVotes(memberCount: number, threshold: Threshold) {
  if (threshold === "unanimity") return memberCount;
  if (threshold === "twothirds") return Math.ceil((memberCount * 2) / 3);
  return Math.floor(memberCount / 2) + 1;
}

export function voteTally(group: Group, vote: Vote) {
  const yes = vote.responses.filter((r) => r.answer === "yes").length;
  const no = vote.responses.filter((r) => r.answer === "no").length;
  const needed = requiredVotes(group.members.length, vote.threshold);
  return { yes, no, needed, total: group.members.length, missing: Math.max(needed - yes, 0) };
}

/* ============================================================
 * SMART REMINDERS — simple, configurable rules.
 * ============================================================ */

export interface Reminder {
  dueId: string;
  date: string;
  kind: "before3" | "before1" | "dayOf" | "afterLate";
  text: string;
}

/** Reminders the member should see today, based on the group settings. */
export function remindersForMember(group: Group, memberId: string): Reminder[] {
  const today = todayISO();
  const out: Reminder[] = [];
  for (const d of group.dues) {
    if (statusFor(group, d.id, memberId) === "paid") continue;
    const diff = Math.round((parseISO(d.date).getTime() - parseISO(today).getTime()) / 86_400_000);
    const push = (kind: Reminder["kind"], text: string) => out.push({ dueId: d.id, date: d.date, kind, text });
    if (diff === 3 && group.reminders.before3) push("before3", pick(currentLang(), { fr: "Dans 3 jours", en: "In 3 days", sw: "Baada ya siku 3" }));
    if (diff === 1 && group.reminders.before1) push("before1", pick(currentLang(), { fr: "Demain", en: "Tomorrow", sw: "Kesho" }));
    if (diff === 0 && group.reminders.dayOf) push("dayOf", pick(currentLang(), { fr: "Aujourd'hui", en: "Today", sw: "Leo" }));
    if (diff < 0 && diff >= -3 && group.reminders.afterLate) push("afterLate", pick(currentLang(), { fr: "Paiement en retard", en: "Late payment", sw: "Malipo yamechelewa" }));
  }
  return out.slice(0, 6);
}

export function upcomingDues(group: Group, limit = 6) {
  const today = todayISO();
  return group.dues.filter((d) => d.date >= today).slice(0, limit);
}

export function defaultRules(): ContractRules {
  return {
    lateRule:
      "Un membre qui n'a pas payé à la date limite est marqué « paiement en retard ». Le groupe est informé et un rappel est envoyé.",
    swapRule:
      "Un membre peut demander à recevoir la cagnotte plus tôt ou plus tard. L'autre membre doit accepter. L'ordre n'est jamais modifié en silence.",
    exitRule:
      "Un membre ne peut quitter le groupe qu'après avoir payé ses cotisations dues, et après un vote du groupe.",
    voteRule: "Les décisions importantes sont prises par vote. Le résultat est visible par tous les membres.",
    swapNeedsVote: false,
    threshold: "simple",
  };
}

export function defaultReminders(): Reminders {
  return { before3: true, before1: true, dayOf: true, afterLate: true };
}
