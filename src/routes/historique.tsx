import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute } from "@tanstack/react-router";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { GroupPicker } from "@/components/zuki/GroupPicker";
import { PreviewList } from "@/components/zuki/PreviewList";
import { useI18n } from "@/lib/i18n";
import { formatMoney, memberOf } from "@/lib/zuki/engine";

export const Route = createFileRoute("/historique")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Historique de groupe — ZUKA PAY" },
      { name: "description", content: "Paiements, échéances, bénéficiaires et pénalités de chaque groupe." },
      { property: "og:title", content: "Historique de groupe — ZUKA PAY" },
      { property: "og:description", content: "Tout l'historique de votre tontine ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { t, formatDate } = useI18n();
  return (
    <Shell>
      <GroupPicker title={t("qa.history")}>
        {(g) => {
          const txs = [...g.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const dues = [...g.dues].sort((a, b) => a.date.localeCompare(b.date));
          const pens = g.penalties ?? [];
          return (
            <>
              <MoneySection><section className="mt-5 px-4">
                <SectionTitle title={t("hist.payments")} hint={`${txs.length}`} eye />
                {txs.length === 0 && <p className="text-sm text-muted-foreground">{t("hist.none")}</p>}
                <PreviewList
                  title={t("hist.payments")}
                  className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card"
                  items={txs}
                  render={(tx) => (
                    <div key={tx.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{memberOf(g, tx.memberId)?.name ?? "—"}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {formatDate(tx.createdAt.slice(0, 10))} · {tx.status}
                          {tx.penaltyAmount ? <> · <Money value={tx.penaltyAmount} currency={tx.currency} prefix="+" /></> : null}
                        </p>
                      </div>
                      <span className="font-mono text-[12px] font-semibold"><Money value={tx.amount} currency={tx.currency} /></span>
                    </div>
                  )}
                />
              </section></MoneySection>
              <MoneySection><section className="mt-5 px-4">
                <SectionTitle title={t("hist.dues")} hint={`${dues.length}`} />
                <PreviewList
                  title={t("hist.dues")}
                  className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card"
                  items={dues}
                  render={(d) => (
                    <div key={d.id} className="flex items-center gap-3 p-3">
                      <span className="font-display text-lg text-deep">{d.index}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{memberOf(g, d.beneficiaryId)?.name ?? "—"}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{formatDate(d.date)}</p>
                      </div>
                    </div>
                  )}
                />
              </section></MoneySection>
              {pens.length > 0 && (
                <MoneySection><section className="mt-5 px-4">
                  <SectionTitle title={t("hist.penalties")} hint={`${pens.length}`} eye />
                  <PreviewList
                    title={t("hist.penalties")}
                    className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card"
                    items={pens}
                    render={(p) => (
                      <div key={`${p.dueId}-${p.memberId}`} className="flex items-center gap-3 p-3">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{memberOf(g, p.memberId)?.name ?? "—"}</p>
                        <span className="font-mono text-[12px] text-bad"><Money value={p.amount} currency={g.currency} /></span>
                      </div>
                    )}
                  />
                </section></MoneySection>
              )}
            </>
          );
        }}
      </GroupPicker>
    </Shell>
  );
}
