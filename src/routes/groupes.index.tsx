import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus, Calculator } from "lucide-react";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { PreviewList } from "@/components/zuki/PreviewList";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { collectedFor, currentDue, formatMoney, potFor, remainingDues, subscriptionTier } from "@/lib/zuki/engine";

export const Route = createFileRoute("/groupes/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Mes groupes tontines ZUKA PAY" },
      { name: "description", content: "Tous vos groupes de tontine et cotisations, actifs et terminés." },
      { property: "og:title", content: "Mes groupes tontines ZUKA PAY" },
      { property: "og:description", content: "Suivez la cagnotte, les échéances et les membres de chaque groupe." },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const { t } = useI18n();
  const { groups } = useZuki();

  return (
    <Shell>
      <MoneySection><section className="px-4 pt-1">
        <SectionTitle title={t("home.myGroups")} hint={`${groups.length}`} eye />
        <PreviewList
          title={t("home.myGroups")}
          className="space-y-3"
          items={groups}
          render={(g) => {
            const due = currentDue(g);
            const tier = subscriptionTier(g.members.length);
            return (
              <Link
                key={g.id}
                to="/groupes/$groupId"
                params={{ groupId: g.id }}
                className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-line"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-lagoon/10 font-display text-base text-lagoon">
                  {g.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    <Money value={g.amount} currency={g.currency} /> · {t(`freq.${g.frequency}`)} · {g.members.length}{" "}
                    {t("group.members")}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {due ? <Money value={collectedFor(g, due.id)} currency={g.currency} /> : "—"} / <Money value={potFor(g)} currency={g.currency} /> ·{" "}
                    {remainingDues(g)} {t("group.tours")} · {tier.price} USD {t("group.perMonth")}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            );
          }}
        />
        <Link
          to="/groupes/nouveau"
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-lagoon/10 text-sm font-semibold text-lagoon"
        >
          <Plus className="size-4" /> {t("home.newGroup")}
        </Link>
        <Link
          to="/simulateur"
          className="mt-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-card text-sm font-semibold text-deep ring-1 ring-line"
        >
          <Calculator className="size-4" /> {t("sim.open")}
        </Link>
      </section></MoneySection>
    </Shell>
  );
}
