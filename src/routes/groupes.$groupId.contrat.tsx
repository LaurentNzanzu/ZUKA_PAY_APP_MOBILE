import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { formatMoney, potFor } from "@/lib/zuki/engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/groupes/$groupId/contrat")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Contrat de la tontine — ZUKA PAY" },
      {
        name: "description",
        content:
          "Règles de la tontine : montant, fréquence, ordre des bénéficiaires, retards, échanges de tours et votes.",
      },
      { property: "og:title", content: "Contrat de la tontine — ZUKA PAY" },
      { property: "og:description", content: "Chaque membre accepte les règles avant le démarrage." },
    ],
  }),
  component: ContractPage,
});

function ContractPage() {
  const { groupId } = useParams({ from: "/groupes/$groupId/contrat" });
  const { t, formatDate } = useI18n();
  const { groups, me, setAcceptance, setLatePenalty } = useZuki();
  const group = groups.find((g) => g.id === groupId);
  const [pOn, setPOn] = useState(false);
  const [pAmount, setPAmount] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPOn(Boolean(group?.latePenalty?.enabled));
    setPAmount(group?.latePenalty?.amount ? String(group.latePenalty.amount) : "");
  }, [group?.latePenalty?.enabled, group?.latePenalty?.amount]);

  if (!group) {
    return (
      <Shell>
        <p className="px-4 text-sm text-muted-foreground">{t("common.groupNotFound")}</p>
      </Shell>
    );
  }

  const mine = group.acceptances[me.id] ?? "pending";
  const allAccepted = group.members.every((m) => group.acceptances[m.id] === "accepted");

  const rules: { label: string; text: string }[] = [
    { label: t("contract.late"), text: group.rules.lateRule },
    { label: t("contract.swap"), text: group.rules.swapRule },
    { label: t("contract.exit"), text: group.rules.exitRule },
    { label: t("contract.vote"), text: group.rules.voteRule },
  ];

  return (
    <Shell>
      <MoneySection><section className="px-4">
        <Link
          to="/groupes/$groupId"
          params={{ groupId: group.id }}
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-lagoon"
        >
          <ArrowLeft className="size-4" /> {t("common.back")}
        </Link>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/10">
            <FileText className="size-5 text-lagoon" />
          </span>
          <div>
            <h1 className="font-display text-2xl leading-tight">{t("contract.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("contract.subtitle")}</p>
          </div>
          <SectionEye className="ml-auto text-deep" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { l: t("create.name"), v: group.name },
            { l: t("create.amount"), v: <Money value={group.amount} currency={group.currency} /> },
            { l: t("create.frequency"), v: t(`freq.${group.frequency}`) },
            { l: t("create.start"), v: formatDate(group.startDate) },
            { l: t("cal.pot"), v: <Money value={potFor(group)} currency={group.currency} /> },
            { l: t("create.count"), v: String(group.dues.length) },
          ].map((x) => (
            <div key={String(x.l)} className="rounded-2xl bg-card p-3 ring-1 ring-line">
              <p className="text-[10px] text-muted-foreground">{x.l}</p>
              <p className="text-sm font-semibold">{x.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <SectionTitle title={t("group.turnOrder")} />
          <div className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line">
            {group.order.map((id, i) => {
              const d = group.dues.find((x) => x.index === i + 1);
              return (
                <div key={id} className="flex items-center gap-3 p-3">
                  <span className="font-display text-lg text-deep">{i + 1}</span>
                  <p className="flex-1 text-sm font-semibold">
                    {group.members.find((m) => m.id === id)?.name}
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {d ? formatDate(d.date) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <SectionTitle title={t("contract.rules")} />
          <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
            {rules.map((r) => (
              <div key={r.label}>
                <p className="text-xs font-bold text-deep">{r.label}</p>
                <p className="text-[12.5px] leading-snug text-muted-foreground">{r.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <SectionTitle
            title={t("contract.acceptances")}
            hint={allAccepted ? t("contract.allAccepted") : t("contract.waiting")}
          />
          <div className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line">
            {group.members.map((m) => {
              const a = group.acceptances[m.id] ?? "pending";
              return (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <p className="flex-1 text-sm font-semibold">{m.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[10px] font-bold",
                      a === "accepted" && "bg-ok/15 text-ok",
                      a === "pending" && "bg-wait/15 text-wait",
                      a === "refused" && "bg-bad/15 text-bad",
                    )}
                  >
                    {a === "accepted"
                      ? t("contract.accepted")
                      : a === "refused"
                        ? t("contract.refused")
                        : t("contract.pending")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {mine !== "accepted" && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setAcceptance(group.id, "accepted");
                toast.success(t("contract.accepted"));
              }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-coral text-sm font-bold text-coral-foreground"
            >
              <Check className="size-4" /> {t("contract.accept")}
            </button>
            <button
              onClick={() => setAcceptance(group.id, "refused")}
              className="grid h-14 w-14 place-items-center rounded-2xl bg-card text-muted-foreground ring-1 ring-line"
              aria-label={t("contract.refuse")}
            >
              <X className="size-5" />
            </button>
          </div>
        )}
        {mine === "accepted" && (
          <p className="mt-4 rounded-2xl bg-ok/10 p-3 text-center text-xs font-semibold text-ok">
            {t("contract.accepted")} ✓
          </p>
        )}
      </section></MoneySection>
    </Shell>
  );
}
