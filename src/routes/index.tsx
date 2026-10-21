import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarClock,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { PreviewList } from "@/components/zuki/PreviewList";
import { PaySheet } from "@/components/zuki/PaySheet";
import { SubscriptionDuesAlert } from "@/components/zuki/SubscriptionDuesAlert";
import { DisputesAlert } from "@/components/zuki/DisputesAlert";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import {
  collectedFor,
  currentDue,
  formatMoney,
  memberOf,
  nextDueForMember,
  paidBy,
  parseISO,
  positionOf,
  potFor,
  remainingDues,
  statusFor,
  todayISO,
  turnDateOf,
} from "@/lib/zuki/engine";
import { StatusChip, Avatar } from "@/components/zuki/StatusChip";
import type { Currency } from "@/lib/zuki/types";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "ZUKA PAY - Gérez vos groupes tontines en ligne, dans vos téléphones" },
      {
        name: "description",
        content:
          "ZUKA PAY - Gérez vos groupes tontines en ligne, dans vos téléphones : cotisations, retards, tours et paiements Mobile Money en CDF et USD.",
      },
      { property: "og:title", content: "ZUKA PAY - Gérez vos groupes tontines en ligne, dans vos téléphones" },
      {
        property: "og:description",
        content:
          "ZUKA PAY - Gérez vos groupes tontines en ligne, dans vos téléphones : cotisations, retards, tours et paiements Mobile Money en CDF et USD.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, formatDate } = useI18n();
  const { groups, me } = useZuki();
  const [paying, setPaying] = useState<{ groupId: string; dueId: string } | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const actionable = groups
    .map((g) => ({ g, due: nextDueForMember(g, me.id) }))
    .filter((x) => x.due && x.due.date <= todayISO());
  const first = actionable[0];

  // Cotisations réellement dues (jour J atteint) et non soldées — source: statut des transactions.
  const overdue = groups
    .flatMap((g) =>
      g.dues
        .filter((d) => d.date <= todayISO() && paidBy(g, d.id, me.id) < g.amount)
        .map((d) => ({ g, due: d, remaining: g.amount - paidBy(g, d.id, me.id) })),
    )
    .sort((a, b) => a.due.date.localeCompare(b.due.date));
  const urgent = overdue[0];
  const others = overdue.slice(1);
  const payGroup = paying ? groups.find((g) => g.id === paying.groupId) : undefined;

  // Total de mes cotisations, par devise — jamais de conversion automatique.
  const totals = new Map<Currency, number>();
  for (const g of groups) {
    let sum = 0;
    for (const d of g.dues) sum += paidBy(g, d.id, me.id);
    totals.set(g.currency, (totals.get(g.currency) ?? 0) + sum);
  }
  const mainCurrency: Currency = groups[0]?.currency ?? "CDF";
  const mainTotal = totals.get(mainCurrency) ?? 0;
  const otherTotals = [...totals.entries()].filter(([c]) => c !== mainCurrency && totals.get(c));

  // Prochaine cagnotte à distribuer, tous groupes confondus.
  const upcoming = groups
    .map((g) => ({ g, due: currentDue(g) }))
    .filter((x) => x.due)
    .sort((a, b) => a.due!.date.localeCompare(b.due!.date))[0];
  const daysLeft = upcoming
    ? Math.max(
        0,
        Math.round((parseISO(upcoming.due!.date).getTime() - parseISO(todayISO()).getTime()) / 86400000),
      )
    : 0;



  return (
    <Shell
      dark
      notifications={groups.reduce((n, g) => n + g.swaps.filter((s) => s.status === "pending").length, 0)}
    >
      {/* Carte financière principale */}
      <h1 className="sr-only">ZUKA PAY — {t("dash.srTitle")}</h1>
      <MoneySection><section className="relative z-0 overflow-hidden rounded-b-[28px] bg-deep px-4 pb-5 pt-1">
        <div className="animate-rise relative overflow-hidden rounded-3xl bg-gradient-emerald p-5 shadow-card">
          <span className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary-foreground/10" />
          <span className="pointer-events-none absolute -bottom-16 -right-4 size-32 rounded-full bg-primary-foreground/10" />
          <div className="relative flex items-start justify-between gap-3">
            <p className="text-[12.5px] font-medium text-primary-foreground/85">{t("dash.balanceTitle")}</p>
            <SectionEye className="-m-1 text-primary-foreground" />
          </div>
          <p className="relative mt-2 font-display text-[34px] font-bold leading-none text-primary-foreground">
            <Money value={mainTotal} currency={mainCurrency} />
          </p>
          {otherTotals.length > 0 && (
            <p className="relative mt-2 font-mono text-[11px] text-primary-foreground/80">
              {otherTotals.map(([c, v], i) => <span key={c}>{i > 0 && " · "}<Money value={v} currency={c} /></span>)}
            </p>
          )}
        </div>
      </section></MoneySection>

      <DisputesAlert />
      <SubscriptionDuesAlert />

      {/* Alerte cotisation urgente */}
      {urgent && (
        <MoneySection><section className="mt-4 px-4">
          <div className="animate-rise rounded-3xl border border-bad/35 bg-bad/8 p-4 shadow-card">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-bad/15 text-bad">
                <AlertTriangle className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-bad">
                  {t("alert.title")}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-foreground">
                  {urgent.due.date === todayISO()
                    ? withMoney(t("alert.dueToday"), urgent.remaining, urgent.g.currency)
                    : withMoney(t("alert.overdue").replace("{date}", formatDate(urgent.due.date)), urgent.remaining, urgent.g.currency)}
                </p>
                <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-bad">
                  {urgent.due.date === todayISO() ? t("alert.today") : t("status.late")} ·{" "}
                  {urgent.g.name}
                </p>
              </div>
              <SectionEye className="text-bad" />
            </div>

            <button
              onClick={() => setPaying({ groupId: urgent.g.id, dueId: urgent.due.id })}
              className="pressable mt-3 flex h-13 w-full items-center justify-center rounded-2xl bg-bad text-[15px] font-bold uppercase tracking-wide text-destructive-foreground shadow-card"
            >
              {t("alert.cta")}
            </button>

            {others.length > 0 && (
              <>
                <button
                  onClick={() => setShowOthers((v) => !v)}
                  className="mt-3 flex w-full items-center justify-between text-[12px] font-medium text-bad"
                >
                  <span>{t("alert.others").replace("{n}", String(others.length))}</span>
                  <span className="font-mono text-[11px]">
                    {showOthers ? t("alert.less") : t("alert.more")}
                  </span>
                </button>
                {showOthers && (
                  <div className="mt-2 divide-y divide-bad/15 overflow-hidden rounded-2xl bg-card">
                    {others.map((o) => (
                      <button
                        key={`${o.g.id}-${o.due.id}`}
                        onClick={() => setPaying({ groupId: o.g.id, dueId: o.due.id })}
                        className="pressable flex w-full items-center gap-3 p-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{o.g.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {formatDate(o.due.date)}
                          </p>
                        </div>
                        <span className="font-mono text-[12px] font-semibold text-bad">
                          <Money value={o.remaining} currency={o.g.currency} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section></MoneySection>
      )}

      {/* Prochaine cagnotte */}
      {upcoming?.due && (
        <MoneySection><section className="mt-4 px-4">
          <Link
            to="/groupes/$groupId"
            params={{ groupId: upcoming.g.id }}
            className="pressable flex items-center gap-3 rounded-3xl bg-card p-4 shadow-card"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint/25 text-deep">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{t("dash.nextPot")}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {memberOf(upcoming.g, upcoming.due.beneficiaryId)?.name} · {upcoming.g.name}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-lagoon">
                {daysLeft === 0
                  ? t("common.today")
                  : t("dash.inDays").replace("{n}", String(daysLeft))}{" "}
                · {formatDate(upcoming.due.date)} · <Money value={potFor(upcoming.g)} currency={upcoming.g.currency} />
              </p>
            </div>
            <SectionEye className="text-deep" />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </section></MoneySection>
      )}

      {/* À payer */}
      {first?.due && (
        <MoneySection><section className="mt-4 px-4">
          <div className="animate-rise rounded-3xl bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("home.due")}
              </p>
              <SectionEye className="-my-2 text-deep" />
            </div>
            <div className="mt-1 flex items-end gap-2">
              <span className="font-display text-[30px] font-bold leading-none text-deep">
                <Money value={first.g.amount - paidBy(first.g, first.due.id, me.id)} currency={first.g.currency} />
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {first.g.name} · {t(`freq.${first.g.frequency}`)} ·{" "}
              {first.due.date === todayISO() ? t("common.today") : formatDate(first.due.date)}
            </p>
            <button
              onClick={() => setPaying({ groupId: first.g.id, dueId: first.due!.id })}
              className="pressable mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-emerald text-[15px] font-semibold text-primary-foreground shadow-card"
            >
              {t("home.pay")}
            </button>
          </div>
        </section></MoneySection>
      )}

      {/* Mes groupes actifs */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("dash.activeGroups")} hint={`${groups.length}`} eye />
        <PreviewList title={t("dash.activeGroups")} items={groups} render={(g) => {
          const due = currentDue(g);
          const collected = due ? collectedFor(g, due.id) : 0;
          const pot = potFor(g);
          const pct = pot ? Math.min(Math.round((collected / pot) * 100), 100) : 0;
          const paidCount = due ? g.members.filter((m) => statusFor(g, due.id, m.id) === "paid").length : 0;
          return (
            <Link
              key={g.id}
              to="/groupes/$groupId"
              params={{ groupId: g.id }}
              className="pressable animate-rise mb-3 block rounded-3xl bg-card p-4 shadow-card"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-lagoon/12 font-display text-sm font-bold text-deep">
                  {g.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-semibold">{g.name}</h3>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {g.members.length}/{g.maxMembers} {t("group.members").toLowerCase()} ·{" "}
                    {t(`freq.${g.frequency}`)}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>

              <div className="mt-3 flex items-end justify-between gap-2">
                <span className="font-display text-[22px] font-bold leading-none text-deep">
                  <Money value={collected} currency={g.currency} />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  / <Money value={pot} currency={g.currency} /> · {pct}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-lagoon/12">
                <div
                  className="h-full rounded-full bg-gradient-emerald transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("dash.membersPaid")
                  .replace("{a}", String(paidCount))
                  .replace("{b}", String(g.members.length))}{" "}
                · <Money value={g.amount} currency={g.currency} /> {t("dash.perMember")} ·{" "}
                {remainingDues(g)} {t("group.tours")}
              </p>
            </Link>
          );
        }} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to="/groupes/nouveau"
            className="pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-lagoon/12 text-[13px] font-semibold text-deep"
          >
            <Plus className="size-4" /> {t("home.newGroup")}
          </Link>
          <Link
            to="/simulateur"
            className="pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-card text-[13px] font-semibold text-deep ring-1 ring-line"
          >
            <Calculator className="size-4" /> {t("sim.open")}
          </Link>
        </div>
      </section></MoneySection>

      {/* Cotisations de l'échéance en cours */}
      {first?.g && first.due && (
        <MoneySection><section className="mt-6 px-4">
          <SectionTitle
            title={`${t("group.contributions")} · ${formatDate(first.due.date)}`}
            hint={<Money value={first.g.amount} currency={first.g.currency} />}
            eye
          />
          <PreviewList
            title={t("group.contributions")}
            className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card"
            items={first.g.members}
            render={(m) => {
              const s = statusFor(first.g, first.due!.id, m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <Avatar name={m.name} status={s} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{m.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {new Intl.NumberFormat("fr-FR").format(paidBy(first.g, first.due!.id, m.id))} /{" "}
                      <Money value={first.g.amount} currency={first.g.currency} />
                    </p>
                  </div>
                  <StatusChip status={s} />
                </div>
              );
            }}
          />
        </section></MoneySection>
      )}

      {/* Mes prochains tours */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("home.nextTurns")} eye />
        <PreviewList
          title={t("home.nextTurns")}
          className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card"
          items={groups}
          render={(g) => (
            <Link
              key={g.id}
              to="/groupes/$groupId"
              params={{ groupId: g.id }}
              className="pressable flex items-center gap-3 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint/25 font-display text-[13px] font-bold text-deep">
                {positionOf(g, me.id)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{g.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {turnDateOf(g, me.id) ? formatDate(turnDateOf(g, me.id)!) : "—"} ·{" "}
                  <Money value={potFor(g)} currency={g.currency} />
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
        />
      </section></MoneySection>

      {payGroup && paying && (
        <PaySheet group={payGroup} dueId={paying.dueId} open onClose={() => setPaying(null)} />
      )}
    </Shell>
  );
}
