import { Money, withMoney, MoneySection, SectionEye } from "@/components/zuki/Money";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { PreviewList } from "@/components/zuki/PreviewList";
import { useI18n } from "@/lib/i18n";
import { LanguagePicker } from "@/components/zuki/LanguagePicker";
import { useZuki } from "@/lib/zuki/store";
import { formatMoney } from "@/lib/zuki/engine";
import type { Currency } from "@/lib/zuki/types";
import { cn } from "@/lib/utils";
import { FileText, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";
import { ReceiptSheet } from "@/components/zuki/ReceiptSheet";
import { SecuritySettings } from "@/components/zuki/SecuritySettings";

export const Route = createFileRoute("/profil")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Profil et historique des paiements — ZUKA PAY" },
      {
        name: "description",
        content: "Modifiez votre langue et votre devise, et consultez l'historique de vos transactions Mobile Money.",
      },
      { property: "og:title", content: "Profil et historique des paiements — ZUKA PAY" },
      { property: "og:description", content: "Français, English, Kiswahili — CDF et USD." },
    ],
  }),
  component: ProfilePage,
});

const inputCls =
  "h-12 w-full rounded-xl bg-card px-3 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon";

function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { me, updateMe, groups, preferredCurrency, setPreferredCurrency } = useZuki();

  const [receipt, setReceipt] = useState<{ groupId: string; txId: string } | null>(null);

  const transactions = groups
    .flatMap((g) => g.transactions.map((tx) => ({ tx, g })))
    .filter((x) => x.tx.memberId === me.id)
    .sort((a, b) => b.tx.createdAt.localeCompare(a.tx.createdAt));

  const selected = receipt
    ? transactions.find((x) => x.g.id === receipt.groupId && x.tx.id === receipt.txId) ?? null
    : null;

  return (
    <Shell>
      <MoneySection><section className="px-4">
        <h1 className="font-display text-2xl">{t("profile.title")}</h1>

        <div className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-line">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/12 text-lagoon">
            {theme === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("profile.appearance")}</p>
            <p className="text-xs text-muted-foreground">
              {theme === "dark" ? t("profile.darkMode") : t("profile.lightMode")}
            </p>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            aria-label={t("profile.darkMode")}
            className="data-[state=unchecked]:bg-muted"
          />
        </div>

        <SecuritySettings />

        <label className="mt-4 block text-xs font-medium text-muted-foreground">{t("profile.name")}</label>
        <input
          className={cn(inputCls, "mt-1")}
          value={me.name}
          onChange={(e) => updateMe({ name: e.target.value.slice(0, 50) })}
        />

        <label className="mt-3 block text-xs font-medium text-muted-foreground">{t("profile.phone")}</label>
        <input
          className={cn(inputCls, "mt-1")}
          inputMode="tel"
          value={me.phone}
          onChange={(e) => updateMe({ phone: e.target.value.slice(0, 20) })}
        />

        <LanguagePicker />

        <p className="mt-4 text-xs font-medium text-muted-foreground">{t("profile.currency")}</p>
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
          {(["CDF", "USD"] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setPreferredCurrency(c)}
              className={cn(
                "h-10 rounded-lg text-xs font-semibold",
                preferredCurrency === c ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <SectionTitle title={t("profile.history")} hint={`${transactions.length}`} eye />
          {transactions.length === 0 && (
            <p className="rounded-2xl bg-card p-4 text-xs text-muted-foreground ring-1 ring-line">{t("profile.noTx")}</p>
          )}
          <PreviewList
            title={t("profile.history")}
            className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line"
            items={transactions}
            render={({ tx, g }) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => setReceipt({ groupId: g.id, txId: tx.id })}
                aria-label={`${t("receipt.open")} ${tx.ref}`}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-background"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold">{g.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {t(`freq.${g.frequency}`)} · {tx.ref}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold"><Money value={tx.amount} currency={tx.currency} /></p>
                  <p
                    className={cn(
                      "font-mono text-[10px] font-bold",
                      tx.status === "SUCCESS" ? "text-ok" : tx.status === "FAILED" ? "text-bad" : "text-warn",
                    )}
                  >
                    {tx.status}
                  </p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lagoon/12 text-lagoon">
                  <FileText className="size-4" />
                </span>
              </button>
            )}
          />
        </div>

        {selected && (
          <ReceiptSheet
            group={selected.g}
            tx={selected.tx}
            open
            onClose={() => setReceipt(null)}
          />
        )}
      </section></MoneySection>
    </Shell>
  );
}
