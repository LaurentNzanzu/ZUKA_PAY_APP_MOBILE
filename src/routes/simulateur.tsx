import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { useI18n } from "@/lib/i18n";
import { formatMoney, simulate, todayISO } from "@/lib/zuki/engine";
import type { Currency, DayMode, Frequency } from "@/lib/zuki/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/simulateur")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Simulateur de tontine — ZUKA PAY" },
      {
        name: "description",
        content:
          "Calculez la cagnotte, le total à payer par membre et la date de réception de chacun avant de créer votre tontine.",
      },
      { property: "og:title", content: "Simulateur de tontine — ZUKA PAY" },
      { property: "og:description", content: "Testez votre tontine en quelques secondes, puis créez-la." },
    ],
  }),
  component: SimulatorPage,
});

const inputCls =
  "h-12 w-full rounded-xl bg-card px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon";

function SimulatorPage() {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  const [members, setMembers] = useState(5);
  const [amount, setAmount] = useState(5000);
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [dayMode, setDayMode] = useState<DayMode>("all");
  const [startDate, setStartDate] = useState(todayISO());
  const [cycles, setCycles] = useState(1);

  const result = useMemo(
    () =>
      simulate({ members, amount, frequency, dayMode, weekdays: [], startDate, cycles, currency }),
    [members, amount, frequency, dayMode, startDate, cycles, currency],
  );

  return (
    <Shell>
      <section className="px-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/10">
            <Calculator className="size-5 text-lagoon" />
          </span>
          <div>
            <h1 className="font-display text-2xl leading-tight">{t("sim.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("sim.subtitle")}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">{t("sim.members")}</label>
            <input
              type="number"
              min={2}
              max={60}
              className={inputCls}
              value={members}
              onChange={(e) => setMembers(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">{t("create.amount")}</label>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">{t("create.currency")}</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
              {(["CDF", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "h-10 rounded-lg text-xs font-semibold",
                    currency === c ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">{t("sim.cycles")}</label>
            <input
              type="number"
              min={1}
              max={6}
              className={inputCls}
              value={cycles}
              onChange={(e) => setCycles(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <label className="mt-3 block text-[10px] text-muted-foreground">{t("create.frequency")}</label>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
          {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className={cn(
                "h-10 rounded-lg text-[11px] font-semibold",
                frequency === f ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t(`freq.${f}`)}
            </button>
          ))}
        </div>

        {frequency === "daily" && (
          <>
            <label className="mt-3 block text-[10px] text-muted-foreground">{t("create.days")}</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
              {(["all", "weekdays"] as DayMode[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDayMode(d)}
                  className={cn(
                    "h-10 rounded-lg text-[11px] font-semibold",
                    dayMode === d ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(`days.${d}`)}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="mt-3 block text-[10px] text-muted-foreground">{t("create.start")}</label>
        <input
          type="date"
          className={inputCls}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value || todayISO())}
        />

        <div className="mt-6">
          <SectionTitle title={t("sim.results")} />
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: t("sim.potPerCycle"), v: formatMoney(result.potPerCycle, currency) },
              { l: t("sim.totalPerMember"), v: formatMoney(result.totalPerMember, currency) },
              { l: t("create.count"), v: String(result.dueCount) },
              { l: t("sim.duration"), v: `${result.durationDays} ${t("sim.days")}` },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-card p-3 ring-1 ring-line">
                <p className="text-[10px] text-muted-foreground">{x.l}</p>
                <p className="font-display text-lg leading-tight text-deep">{x.v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <SectionTitle title={t("sim.calendar")} hint={`${result.rows.length}`} />
          <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-2xl bg-card ring-1 ring-line">
            {result.rows.map((r) => (
              <div key={r.index} className="flex items-center gap-3 p-3">
                <span className="font-display text-base text-deep">{r.index}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{formatDate(r.date)}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("sim.position")} {r.position} · {t("sim.receive")}
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold">{formatMoney(r.pot, currency)}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() =>
            navigate({
              to: "/groupes/nouveau",
              search: {
                members,
                amount,
                currency,
                frequency,
                dayMode,
                startDate,
                count: result.dueCount,
              },
            })
          }
          className="mt-4 h-14 w-full rounded-2xl bg-coral text-sm font-bold text-coral-foreground"
        >
          {t("sim.createFromSim")}
        </button>
      </section>
    </Shell>
  );
}
