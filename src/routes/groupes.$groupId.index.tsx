import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, CalendarDays, FileText, Repeat, Vote as VoteIcon } from "lucide-react";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { PaySheet } from "@/components/zuki/PaySheet";
import { PreviewList } from "@/components/zuki/PreviewList";
import { CreditEligibility } from "@/components/zuki/CreditEligibility";
import { GroupSubscription, useGroupSubscription } from "@/components/zuki/GroupSubscription";
import { GroupGovernance } from "@/components/zuki/GroupGovernance";
import { GroupInvites } from "@/components/zuki/GroupInvites";
import { StatusChip, Avatar } from "@/components/zuki/StatusChip";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import {
  collectedFor,
  currentDue,
  groupHealth,
  upcomingDues,
  formatMoney,
  groupTotals,
  memberOf,
  paidBy,
  potFor,
  remainingDues,
  statusFor,
  subscriptionTier,
  todayISO,
} from "@/lib/zuki/engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/groupes/$groupId/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Suivi du groupe — ZUKA PAY" },
      {
        name: "description",
        content: "Cagnotte collectée, membres à jour ou en retard, ordre des tours et journal du groupe.",
      },
      { property: "og:title", content: "Suivi du groupe — ZUKA PAY" },
      { property: "og:description", content: "Transparence totale sur les cotisations et les échanges de tours." },
    ],
  }),
  component: GroupPage,
});

function GroupPage() {
  const { groupId } = useParams({ from: "/groupes/$groupId/" });
  const { t, formatDate } = useI18n();
  const { groups, me, requestSwap, resolveSwap } = useZuki();
  const { setReminders } = useZuki();
  const [paying, setPaying] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapDirection, setSwapDirection] = useState<"earlier" | "later">("earlier");

  const sub = useGroupSubscription(groupId);
  const locked = !!sub.data && (sub.data.blocked || !sub.data.launched);
  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    return (
      <Shell>
        <p className="px-4 text-sm text-muted-foreground">{t("common.groupNotFound")}</p>
      </Shell>
    );
  }

  const due = currentDue(group);
  const totals = due ? groupTotals(group, due.id) : { expected: 0, collected: 0, remaining: 0, upToDate: 0, late: 0 };
  const pct = totals.expected ? Math.min(Math.round((totals.collected / totals.expected) * 100), 100) : 0;
  const myStatus = due ? statusFor(group, due.id, me.id) : "pending";
  const myRemaining = due ? Math.max(group.amount - paidBy(group, due.id, me.id), 0) : 0;
  const pendingForMe = group.swaps.find((s) => s.status === "pending" && s.toMemberId === me.id);
  const tier = subscriptionTier(group.members.length);
  const health = groupHealth(group);
  const acceptedCount = group.members.filter((m) => group.acceptances[m.id] === "accepted").length;
  const openVotes = group.votes.filter((v) => v.status === "open").length;
  const calendar = upcomingDues(group, 5);

  return (
    <Shell notifications={pendingForMe ? 1 : 0}>
      <MoneySection><section className="relative overflow-hidden bg-gradient-lagoon px-4 pb-5 pt-3">
        <div className="absolute inset-0 bg-stripes opacity-30" />
        <div className="relative animate-rise">
          <h1
            className={cn(
              "break-words font-display font-bold leading-[1.05] tracking-tight text-primary-foreground",
              group.name.length <= 14 && "text-[42px]",
              group.name.length > 14 && group.name.length <= 26 && "text-[34px]",
              group.name.length > 26 && "text-[27px]",
            )}
          >
            {group.name}
          </h1>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-[46px] leading-none text-primary-foreground">
              {new Intl.NumberFormat("fr-FR").format(totals.collected)}
            </span>
            <span className="mb-2 font-mono text-sm text-primary-foreground/70">
              / <Money value={totals.expected} currency={group.currency} />
            </span>
            <SectionEye className="mb-1 ml-auto text-primary-foreground" />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/20">
            <div className="h-full rounded-full bg-card transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-primary-foreground/70">
            {t(`freq.${group.frequency}`)} · {t("common.due")}{" "}
            {due ? (due.date === todayISO() ? t("common.today") : formatDate(due.date)) : "—"}
          </p>
          {myRemaining > 0 && due && (
            <button
              onClick={() => (locked ? toast.error(sub.data?.blocked ? t("common.subLate") : t("common.notLaunched")) : setPaying(true))}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-coral text-base font-semibold text-coral-foreground transition-transform active:scale-[0.99]"
            >
              {t("home.pay")} <span className="font-mono"><Money value={myRemaining} currency={group.currency} /></span>
            </button>
          )}
        </div>
      </section></MoneySection>
      <GroupSubscription tontineId={group.id} />
      <GroupGovernance tontineId={group.id} />

      <MoneySection><section className="-mt-3 px-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t("group.upToDate"), value: `${totals.upToDate}/${group.members.length}`, tone: "text-ok" },
            { label: t("group.late"), value: String(totals.late), tone: "text-bad" },
            { label: t("group.remainingDues"), value: String(remainingDues(group)), tone: "text-deep" },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl bg-card p-3 ring-1 ring-line">
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
              <p className={cn("font-display text-xl leading-tight", k.tone)}>{k.value}</p>
            </div>
          ))}
        </div>
      </section></MoneySection>

      {/* Santé du groupe */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("health.title")} />
        <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full text-lg",
                health.level === "stable" && "bg-ok/15",
                health.level === "watch" && "bg-warn/15",
                health.level === "alert" && "bg-bad/15",
              )}
            >
              {health.level === "stable" ? "🟢" : health.level === "watch" ? "🟡" : "🔴"}
            </span>
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-bold",
                  health.level === "stable" && "text-ok",
                  health.level === "watch" && "text-warn",
                  health.level === "alert" && "text-bad",
                )}
              >
                {t(`health.${health.level}`)}
              </p>
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                {health.level === "stable"
                  ? t("health.stableMsg")
                  : health.level === "watch"
                    ? t("health.watchMsg")
                    : t("health.alertMsg")}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
            <div>
              <p className="text-[10px] text-muted-foreground">{t("health.onTime")}</p>
              <p className="font-display text-lg text-deep">{health.onTimeRate}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{t("group.late")}</p>
              <p className="font-display text-lg text-bad">{health.lateCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{t("group.members")}</p>
              <p className="font-display text-lg text-deep">{group.members.length}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{t("health.note")}</p>
        </div>
      </section></MoneySection>

      {/* Contrat + votes */}
      <MoneySection><section className="mt-4 grid grid-cols-2 gap-2 px-4">
        <Link
          to="/groupes/$groupId/contrat"
          params={{ groupId: group.id }}
          className="rounded-2xl bg-card p-4 ring-1 ring-line"
        >
          <FileText className="size-5 text-lagoon" />
          <p className="mt-2 text-sm font-semibold">{t("contract.open")}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {acceptedCount}/{group.members.length} {t("contract.accepted").toLowerCase()}
          </p>
        </Link>
        <Link
          to="/groupes/$groupId/votes"
          params={{ groupId: group.id }}
          className="rounded-2xl bg-card p-4 ring-1 ring-line"
        >
          <VoteIcon className="size-5 text-lagoon" />
          <p className="mt-2 text-sm font-semibold">{t("vote.title")}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {openVotes} {t("vote.ongoing").toLowerCase()}
          </p>
        </Link>
      </section></MoneySection>

      <CreditEligibility groupId={group.id} />


      {/* Demande d'échange reçue */}
      {pendingForMe && (
        <MoneySection><section className="mt-6 px-4">
          <SectionTitle title={t("group.swapRequest")} />
          <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
            <p className="text-[13px] leading-snug">
              <b>{memberOf(group, pendingForMe.fromMemberId)?.name}</b> ({pendingForMe.fromPosition}) ↔{" "}
              <b>{memberOf(group, pendingForMe.toMemberId)?.name}</b> ({pendingForMe.toPosition})
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  resolveSwap(group.id, pendingForMe.id, true);
                  toast.success(t("group.accept"));
                }}
                className="h-11 flex-1 rounded-xl bg-lagoon text-xs font-bold text-primary-foreground"
              >
                {t("group.accept")}
              </button>
              <button
                onClick={() => resolveSwap(group.id, pendingForMe.id, false)}
                className="h-11 flex-1 rounded-xl bg-card text-xs font-bold text-muted-foreground ring-1 ring-line"
              >
                {t("group.refuse")}
              </button>
            </div>
          </div>
        </section></MoneySection>
      )}

      {/* Tableau de suivi des cotisations */}
      {due && (
        <MoneySection><section className="mt-6 px-4">
          <SectionTitle
            title={`${t("group.contributions")} · ${formatDate(due.date)}`}
            hint={<Money value={group.amount} currency={group.currency} />}
            eye
          />
          <PreviewList
            title={t("group.contributions")}
            className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line"
            items={group.members}
            render={(m) => {
              const s = statusFor(group, due.id, m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <Avatar name={m.name} status={s} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {new Intl.NumberFormat("fr-FR").format(paidBy(group, due.id, m.id))} /{" "}
                      <Money value={group.amount} currency={group.currency} />
                    </p>
                  </div>
                  <StatusChip status={s} />
                </div>
              );
            }}
          />
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            {t("group.collected")} <Money value={collectedFor(group, due.id)} currency={group.currency} /> · {t("group.remaining")}{" "}
            <Money value={totals.remaining} currency={group.currency} />
          </p>
        </section></MoneySection>
      )}

      {/* Ordre des tours */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("group.turnOrder")} hint={`${group.dues.length} ${t("group.tours")}`} eye />
        <PreviewList
          title={t("group.turnOrder")}
          className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line"
          items={group.order}
          render={(memberId, i) => {
            const d = group.dues.find((x) => x.index === i + 1);
            const relevant = group.swaps.find(
              (sw) =>
                (sw.status === "pending" || sw.status === "awaiting_vote") &&
                (sw.fromMemberId === memberId || sw.toMemberId === memberId),
            );
            const inSwap = Boolean(relevant);
            return (
              <div
                key={memberId}
                className={cn("flex items-center gap-3 p-3", inSwap && "bg-lagoon/5")}
              >
                <span className={cn("font-display text-lg", inSwap ? "text-lagoon" : "text-deep")}>{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{memberOf(group, memberId)?.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {d ? formatDate(d.date) : "—"} · <Money value={potFor(group)} currency={group.currency} />
                  </p>
                </div>
                {inSwap && (
                  <span className="rounded-full bg-warn/15 px-2 py-1 text-[9px] font-bold tracking-wide text-warn">
                    {relevant?.status === "awaiting_vote" ? t("swap.awaitingVote") : t("group.swapPending")}
                  </span>
                )}
              </div>
            );
          }}
        />
        <button
          onClick={() => setSwapOpen((v) => !v)}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lagoon/10 text-sm font-semibold text-lagoon"
        >
          <Repeat className="size-4" /> {t("group.askSwap")}
        </button>
        {swapOpen && (
          <div className="mt-2 rounded-2xl bg-card p-3 ring-1 ring-line">
            <p className="mb-2 text-xs text-muted-foreground">{t("swap.direction")}</p>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-background p-1 ring-1 ring-line">
              {(["earlier", "later"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setSwapDirection(d)}
                  className={cn(
                    "h-10 rounded-lg text-[11px] font-semibold",
                    swapDirection === d ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(`swap.${d}`)}
                </button>
              ))}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{t("swap.available")}</p>
            <div className="grid gap-1.5">
              {group.members
                .filter((m) => m.id !== me.id)
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      requestSwap(group.id, m.id, swapDirection);
                      setSwapOpen(false);
                      toast.success(t("group.send"));
                    }}
                    className="flex h-11 items-center justify-between rounded-xl bg-background px-3 text-sm"
                  >
                    <span>{m.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{group.order.indexOf(m.id) + 1}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">{t("swap.noSilent")}</p>
      </section></MoneySection>

      {/* Calendrier des prochaines dates limites */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("cal.title")} eye />
        <PreviewList
          title={t("cal.title")}
          className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line"
          items={upcomingDues(group, 100)}
          render={(d) => (
            <div key={d.id} className="flex items-center gap-3 p-3">
              <CalendarDays className="size-4 shrink-0 text-lagoon" />
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {d.date === todayISO() ? t("common.today") : formatDate(d.date)}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {memberOf(group, d.beneficiaryId)?.name} {t("cal.receives")}{" "}
                  <Money value={potFor(group)} currency={group.currency} />
                </p>
              </div>
            </div>
          )}
        />
      </section></MoneySection>

      {/* Rappels */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("remind.title")} />
        <div className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line">
          {(
            [
              ["before3", t("remind.before3")],
              ["before1", t("remind.before1")],
              ["dayOf", t("remind.dayOf")],
              ["afterLate", t("remind.afterLate")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setReminders(group.id, { [key]: !group.reminders[key] })}
              className="flex w-full items-center gap-3 p-3 text-left"
            >
              <Bell className={cn("size-4", group.reminders[key] ? "text-lagoon" : "text-muted-foreground")} />
              <span className="flex-1 text-[13px]">{label}</span>
              <span
                className={cn(
                  "h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors",
                  group.reminders[key] ? "bg-lagoon" : "bg-line",
                )}
              >
                <span
                  className={cn(
                    "block size-5 rounded-full bg-card transition-transform",
                    group.reminders[key] && "translate-x-5",
                  )}
                />
              </span>
            </button>
          ))}
        </div>
      </section></MoneySection>

      <GroupInvites tontineId={group.id} groupName={group.name} />

      {/* Abonnement */}
      <MoneySection><section className="mt-6 px-4">
        <p className="rounded-2xl bg-card p-4 font-mono text-[10px] text-muted-foreground ring-1 ring-line">
          {t("group.subscription")} · {group.members.length} {t("group.members")} — {tier.price} USD{" "}
          {t("group.perMonth")}
        </p>
      </section></MoneySection>

      {/* Journal */}
      <MoneySection><section className="mt-6 px-4">
        <SectionTitle title={t("group.log")} />
        {group.logs.length === 0 && (
          <p className="rounded-2xl bg-card p-4 text-xs text-muted-foreground ring-1 ring-line">—</p>
        )}
        {group.logs.length > 0 && (
          <PreviewList
            title={t("group.log")}
            className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line"
            items={group.logs}
            render={(l) => (
              <div key={l.id} className="flex gap-3">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-lagoon" />
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {new Date(l.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="text-[12.5px] leading-snug">{l.text}</p>
                </div>
              </div>
            )}
          />
        )}
      </section></MoneySection>

      {due && <PaySheet group={group} dueId={due.id} open={paying} onClose={() => setPaying(false)} />}
      <span className="sr-only">{myStatus}</span>
    </Shell>
  );
}
