import { translateError } from "@/lib/i18n/errors";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Shell, SectionTitle } from "@/components/zuki/Shell";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { buildDues, defaultReminders, defaultRules, formatMoney, todayISO } from "@/lib/zuki/engine";
import type { Currency, DayMode, Frequency, Group, Member } from "@/lib/zuki/types";
import { cn } from "@/lib/utils";

interface SimPreset {
  members?: number;
  amount?: number;
  currency?: Currency;
  frequency?: Frequency;
  dayMode?: DayMode;
  startDate?: string;
  count?: number;
}

export const Route = createFileRoute("/groupes/nouveau")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Créer une tontine — ZUKA PAY" },
      {
        name: "description",
        content: "Définissez le montant, la fréquence et les jours de cotisation, puis visualisez la simulation complète.",
      },
      { property: "og:title", content: "Créer une tontine — ZUKA PAY" },
      { property: "og:description", content: "Simulation transparente avant de confirmer votre tontine." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SimPreset => {
    const out: SimPreset = {};
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
    const members = num(search["members"]);
    if (members && Number.isFinite(members)) out.members = members;
    const amount = num(search["amount"]);
    if (amount && Number.isFinite(amount)) out.amount = amount;
    const count = num(search["count"]);
    if (count && Number.isFinite(count)) out.count = count;
    if (search["currency"] === "USD" || search["currency"] === "CDF") out.currency = search["currency"];
    if (["daily", "weekly", "monthly"].includes(String(search["frequency"])))
      out.frequency = search["frequency"] as Frequency;
    if (["all", "weekdays", "custom"].includes(String(search["dayMode"])))
      out.dayMode = search["dayMode"] as DayMode;
    if (typeof search["startDate"] === "string" && search["startDate"]) out.startDate = search["startDate"];
    return out;
  },
  component: NewGroup,
});

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL = ["D", "L", "M", "M", "J", "V", "S"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-xl bg-card px-3 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 rounded-lg text-xs font-semibold transition-colors",
            value === o.value ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewGroup() {
  const { t, formatDate } = useI18n();
  const { addGroup, me, newId } = useZuki();
  const navigate = useNavigate();
  const preset = Route.useSearch();

  const [step, setStep] = useState<"form" | "sim">("form");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>(preset.currency ?? "CDF");
  const [maxMembers, setMaxMembers] = useState(String(preset.members ?? 10));
  const [amount, setAmount] = useState(String(preset.amount ?? 5000));
  const [frequency, setFrequency] = useState<Frequency>(preset.frequency ?? "daily");
  const [dayMode, setDayMode] = useState<DayMode>(preset.dayMode ?? "all");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [startDate, setStartDate] = useState(preset.startDate ?? todayISO());
  const [count, setCount] = useState(String(preset.count ?? 10));
  const [penaltyOn, setPenaltyOn] = useState(false);
  const [penaltyAmount, setPenaltyAmount] = useState("");
  const [subMode, setSubMode] = useState<"same" | "rotate" | "custom" | null>(null);
  const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });

  const members: Member[] = useMemo(
    () => [{ id: me.id, name: me.name, phone: me.phone, role: "admin" }],
    [me],
  );

  const dues = useMemo(
    () =>
      buildDues({
        startDate,
        frequency,
        dayMode,
        weekdays,
        count: Math.max(1, Math.min(Number(count) || 1, 120)),
        order: members.map((m) => m.id),
        idPrefix: "sim",
      }),
    [startDate, frequency, dayMode, weekdays, count, members],
  );

  const amountNum = Number(amount) || 0;
  const membersNum = Math.max(2, Number(maxMembers) || 2);
  const pot = amountNum * membersNum;
  const penaltyNum = Number(penaltyAmount) || 0;
  const valid = name.trim().length > 1 && amountNum > 0 && (!penaltyOn || penaltyNum > 0) && subMode !== null;

  const confirm = async () => {
    const id = newId("g");
    const order = members.map((m) => m.id);
    const group: Group = {
      id,
      name: name.trim(),
      description: description.trim(),
      currency,
      maxMembers: membersNum,
      amount: amountNum,
      frequency,
      dayMode,
      weekdays,
      startDate,
      totalDues: dues.length,
      members,
      order,
      dues: buildDues({
        startDate,
        frequency,
        dayMode,
        weekdays,
        count: dues.length,
        order,
        idPrefix: id,
      }),
      transactions: [],
      swaps: [],
      votes: [],
      rules: defaultRules(),
      acceptances: { [me.id]: "accepted" as const },
      reminders: defaultReminders(),
      latePenalty: { enabled: penaltyOn, amount: penaltyOn ? penaltyNum : 0 },
      subscriptionMode: subMode ?? "same",
      logs: [
        {
          id: `${id}-l0`,
          at: new Date().toISOString(),
          text: `${me.name} a créé la tontine ${name.trim()}.`,
        },
      ],
    };
    try {
      const savedId = await addGroup(group);
      toast.success(t("create.created"));
      void navigate({ to: "/groupes/$groupId", params: { groupId: savedId } });
    } catch (e) {
      toast.error(translateError(e, ["Création impossible.", "Could not create the group.", "Imeshindwa kuunda kikundi."]));
    }
  };

  return (
    <Shell>
      <section className="px-4 pb-4">
        <h1 className="font-display text-2xl">{t("create.title")}</h1>

        {step === "form" ? (
          <>
            <Field label={t("create.name")}>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="Tontine Famille Safari"
              />
            </Field>
            <Field label={t("create.description")}>
              <input
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 140))}
              />
            </Field>
            <Field label={t("create.currency")}>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-line">
                {(["CDF", "USD"] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
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
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("create.amount")}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                />
              </Field>
              <Field label={t("create.maxMembers")}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
            <Field label={t("create.frequency")}>
              <Segmented
                value={frequency}
                onChange={setFrequency}
                options={[
                  { value: "daily", label: t("freq.daily") },
                  { value: "weekly", label: t("freq.weekly") },
                  { value: "monthly", label: t("freq.monthly") },
                ]}
              />
            </Field>
            {frequency === "daily" && (
              <>
                <Field label={t("create.days")}>
                  <Segmented
                    value={dayMode}
                    onChange={setDayMode}
                    options={[
                      { value: "all", label: t("days.all") },
                      { value: "weekdays", label: t("days.weekdays") },
                      { value: "custom", label: t("days.custom") },
                    ]}
                  />
                </Field>
                {dayMode === "custom" && (
                  <div className="mt-2 flex gap-1.5">
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))
                        }
                        className={cn(
                          "size-10 rounded-full text-xs font-bold",
                          weekdays.includes(d)
                            ? "bg-lagoon text-primary-foreground"
                            : "bg-card text-muted-foreground ring-1 ring-line",
                        )}
                      >
                        {WEEKDAY_LABEL[d]}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("create.start")}>
                <input
                  type="date"
                  className={inputCls}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label={t("create.count")}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </Field>
            </div>

            <div className="mt-4 rounded-2xl bg-card p-3 ring-1 ring-line">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t("penalty.enable")}</span>
                <input
                  type="checkbox"
                  checked={penaltyOn}
                  onChange={(e) => setPenaltyOn(e.target.checked)}
                  className="size-5 accent-[var(--color-lagoon)]"
                />
              </label>
              {penaltyOn && (
                <Field label={`${t("penalty.amount")} (${currency})`}>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={penaltyAmount}
                    onChange={(e) => setPenaltyAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
                    placeholder={currency === "USD" ? "2" : "5000"}
                  />
                </Field>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">{t("penalty.hint")}</p>
            </div>

            <div className="mt-4 rounded-2xl bg-card p-3 ring-1 ring-line">
              <p className="text-sm font-semibold">
                {L("Abonnement du groupe", "Group subscription", "Usajili wa kikundi")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {L(
                  "Le premier mois est gratuit. Ensuite, un abonnement mensuel est payé par le payeur désigné.",
                  "The first month is free. After that, a monthly subscription is paid by the designated payer.",
                  "Mwezi wa kwanza ni bure. Baadaye, usajili wa kila mwezi hulipwa na mlipaji aliyeteuliwa.",
                )}
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked readOnly className="size-5 accent-[var(--color-lagoon)]" />
                {L("Premier payeur : moi", "First payer: me", "Mlipaji wa kwanza: mimi")} ({me.name})
              </label>
              <p className="mt-3 text-xs font-medium text-muted-foreground">
                {L("Rythme des payeurs (obligatoire)", "Payer rhythm (required)", "Mpangilio wa walipaji (lazima)")}
              </p>
              <div className="mt-1 grid gap-1">
                {([
                  ["same", L("Même payeur chaque mois", "Same payer every month", "Mlipaji yule yule kila mwezi")],
                  ["rotate", L("Changement de payeur à chaque échéance", "Payer changes every due date", "Mlipaji hubadilika kila tarehe")],
                  ["custom", L("Tour de paiement personnalisé", "Custom payment order", "Mpangilio maalum wa malipo")],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSubMode(v)}
                    className={cn(
                      "min-h-10 rounded-lg px-3 py-2 text-left text-xs font-semibold ring-1 ring-line",
                      subMode === v ? "bg-lagoon text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {subMode && subMode !== "same" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {L(
                    "Après avoir invité les membres, définissez l'ordre des payeurs dans la page du groupe avant de lancer la tontine.",
                    "After inviting members, set the payer order on the group page before launching.",
                    "Baada ya kualika wanachama, weka mpangilio wa walipaji kwenye ukurasa wa kikundi kabla ya kuanza.",
                  )}
                </p>
              )}
              {!subMode && (
                <p className="mt-2 text-[11px] text-destructive">
                  {L(
                    "Configuration de l'abonnement requise avant le lancement du groupe. Veuillez définir le ou les payeurs ainsi que leur rythme de paiement.",
                    "Subscription setup required before launching the group. Please set the payer(s) and their payment rhythm.",
                    "Mipangilio ya usajili inahitajika kabla ya kuanza kikundi. Tafadhali weka mlipaji/walipaji na mpangilio wao.",
                  )}
                </p>
              )}
            </div>

            <button
              disabled={!valid}
              onClick={() => setStep("sim")}
              className="mt-5 h-14 w-full rounded-2xl bg-coral text-base font-semibold text-coral-foreground disabled:opacity-50"
            >
              {t("create.simulate")}
            </button>
          </>
        ) : (
          <>
            <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-line">
              <p className="text-sm font-semibold">{name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {formatMoney(amountNum, currency)} · {t(`freq.${frequency}`)} · {membersNum} {t("group.members")}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {penaltyOn ? `${t("penalty.late")} : ${formatMoney(penaltyNum, currency)}` : t("penalty.off")}
              </p>
              <p className="mt-2 font-display text-3xl leading-none text-deep">{formatMoney(pot, currency)}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{t("home.estimatedPot")}</p>
            </div>

            <div className="mt-4">
              <SectionTitle title={t("group.simulation")} hint={`${dues.length} ${t("group.tours")}`} />
              <div className="divide-y divide-line rounded-2xl bg-card ring-1 ring-line">
                {dues.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3 p-3">
                    <span className="font-display text-lg text-deep">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">
                        {i === 0 ? me.name : `${t("group.members")} ${i + 1}`}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {formatDate(d.date)} · {formatMoney(pot, currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setStep("form")}
                className="h-14 flex-1 rounded-2xl bg-card text-sm font-semibold text-muted-foreground ring-1 ring-line"
              >
                {t("create.back")}
              </button>
              <button
                onClick={confirm}
                className="h-14 flex-[2] rounded-2xl bg-coral text-base font-semibold text-coral-foreground"
              >
                {t("create.confirm")}
              </button>
            </div>
          </>
        )}
      </section>
    </Shell>
  );
}
