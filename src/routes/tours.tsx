import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { PreviewList } from "@/components/zuki/PreviewList";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { formatMoney, memberOf, positionOf, potFor, statusFor, todayISO, turnDateOf } from "@/lib/zuki/engine";
import { StatusChip } from "@/components/zuki/StatusChip";

export const Route = createFileRoute("/tours")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Mes tours et échéances — ZUKA PAY" },
      {
        name: "description",
        content: "Votre position, la date estimée de votre tour et vos prochaines échéances de cotisation.",
      },
      { property: "og:title", content: "Mes tours et échéances — ZUKA PAY" },
      { property: "og:description", content: "Simulation transparente de vos tours dans chaque tontine." },
    ],
  }),
  component: TurnsPage,
});

function TurnsPage() {
  const { t, formatDate } = useI18n();
  const { groups, me } = useZuki();

  return (
    <Shell>
      <MoneySection><section className="px-4">
        <h1 className="font-display text-2xl">{t("turns.title")}</h1>
        {groups.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t("turns.empty")}</p>}

        {groups.map((g) => {
          const upcoming = g.dues.filter((d) => d.date >= todayISO());
          return (
            <MoneySection key={g.id}><div className="mt-5">
              <SectionTitle
                title={g.name}
                hint={`${t("home.position")} ${positionOf(g, me.id)} · ${
                  turnDateOf(g, me.id) ? formatDate(turnDateOf(g, me.id)!) : "—"
                }`}
                eye
              />
              <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t("home.estimatedPot")}
                </p>
                <p className="font-display text-3xl leading-none text-deep">
                  <Money value={potFor(g)} currency={g.currency} />
                </p>
              </div>
              <div className="mt-2" />
              <PreviewList
                title={g.name}
                className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line"
                items={upcoming}
                render={(d) => (
                  <Link
                    key={d.id}
                    to="/groupes/$groupId"
                    params={{ groupId: g.id }}
                    className="flex items-center gap-3 p-3"
                  >
                    <span className="font-display text-lg text-deep">{d.index}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{memberOf(g, d.beneficiaryId)?.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(d.date)} · <Money value={g.amount} currency={g.currency} />
                      </p>
                    </div>
                    <StatusChip status={statusFor(g, d.id, me.id)} />
                  </Link>
                )}
              />
            </div></MoneySection>
          );
        })}
      </section></MoneySection>
    </Shell>
  );
}
