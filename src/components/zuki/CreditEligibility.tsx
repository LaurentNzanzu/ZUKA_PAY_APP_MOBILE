import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, ChevronDown, Landmark, X } from "lucide-react";
import { getGroupEligibility } from "@/lib/credit/eligibility.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Bar({ value, ok }: { value: number; ok: boolean }) {
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", ok ? "bg-primary" : "bg-destructive/70")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function Row({ ok, label, value, pct, note }: { ok: boolean; label: string; value: string; pct: number; note?: string | undefined }) {
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-5 w-5 place-items-center rounded-full", ok ? "bg-primary text-primary-foreground" : "bg-destructive/15 text-destructive")}>
          {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </span>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
      <Bar value={pct} ok={ok} />
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </li>
  );
}

const EVENT_LABELS: Record<string, { en: string; sw: string }> = {
  year_reset: { en: "Yearly late-payment counter reset.", sw: "Hesabu ya ucheleweshaji wa mwaka imeanza upya." },
  condition_age: { en: "Seniority condition updated.", sw: "Sharti la uzoefu limesasishwa." },
  condition_period_late: { en: "Late payments per due date condition updated.", sw: "Sharti la ucheleweshaji kwa awamu limesasishwa." },
  condition_year_late: { en: "Yearly late payments condition updated.", sw: "Sharti la ucheleweshaji wa mwaka limesasishwa." },
  condition_members: { en: "Active members condition updated.", sw: "Sharti la wanachama hai limesasishwa." },
  condition_successful: { en: "Successful due dates condition updated.", sw: "Sharti la awamu zilizofanikiwa limesasishwa." },
  eligibility: { en: "Group eligibility status changed.", sw: "Hali ya ustahiki wa kikundi imebadilika." },
};

function eventLabel(kind: string, lang: "en" | "sw") {
  return EVENT_LABELS[kind]?.[lang] ?? (lang === "en" ? "Eligibility updated." : "Ustahiki umesasishwa.");
}

export function CreditEligibility({ groupId }: { groupId: string }) {
  const { formatDate, L, lang } = useI18n();
  const fetchFn = useServerFn(getGroupEligibility);
  const [open, setOpen] = useState(false);
  const isUuid = /^[0-9a-f-]{36}$/i.test(groupId);
  const { data, isLoading } = useQuery({
    queryKey: ["credit-eligibility", groupId],
    queryFn: () => fetchFn({ data: { groupId } }),
    enabled: isUuid,
  });
  if (!isUuid) return null;
  const s = data?.status;
  const th = (s?.thresholds ?? {}) as Record<string, number>;
  const minAge = th["min_age_months"] ?? 12;
  const maxPl = th["max_late_per_period"] ?? 4;
  const maxYl = th["max_late_per_year"] ?? 19;
  const minMem = th["min_active_members"] ?? 10;
  const minSucc = th["min_successful_periods"] ?? 5;
  const rec = th["recovery_periods"] ?? 2;

  const reasons: string[] = [];
  if (s) {
    if (!s.c_age) reasons.push(L({ fr: `Votre groupe doit encore atteindre ${minAge - s.age_months} mois d'ancienneté.`, en: `Your group still needs ${minAge - s.age_months} more month(s) of seniority.`, sw: `Kikundi chako bado kinahitaji miezi ${minAge - s.age_months} zaidi ya uzoefu.` }));
    if (s.period_state === "restricted")
      reasons.push(L({ fr: `Votre groupe a compté ${s.last_period_late} retards sur la dernière échéance. De meilleures échéances rétabliront progressivement cette condition.`, en: `Your group had ${s.last_period_late} late payments on the last due date. Better due dates will gradually restore this condition.`, sw: `Kikundi chako kilikuwa na ucheleweshaji ${s.last_period_late} katika awamu iliyopita. Awamu bora zitarejesha sharti hili taratibu.` }));
    if (s.period_state === "recovering")
      reasons.push(L({ fr: `Récupération en cours : ${s.recovery_streak}/${rec} échéance(s) sans excès de retards.`, en: `Recovery in progress: ${s.recovery_streak}/${rec} due date(s) without excess late payments.`, sw: `Urejeshaji unaendelea: awamu ${s.recovery_streak}/${rec} bila ucheleweshaji mwingi.` }));
    if (!s.c_year_late) reasons.push(L({ fr: `Le groupe a atteint ${s.year_late} retards en ${s.year}. Le compteur repart à la nouvelle année.`, en: `The group reached ${s.year_late} late payments in ${s.year}. The counter resets in the new year.`, sw: `Kikundi kimefikia ucheleweshaji ${s.year_late} mwaka ${s.year}. Hesabu inaanza upya mwaka mpya.` }));
    if (!s.c_members) reasons.push(L({ fr: `Il manque ${minMem - s.active_members} membre(s) actif(s).`, en: `${minMem - s.active_members} more active member(s) needed.`, sw: `Wanachama hai ${minMem - s.active_members} zaidi wanahitajika.` }));
    if (!s.c_successful) reasons.push(L({ fr: `Votre groupe doit encore terminer ${minSucc - s.successful_periods} échéance(s) avec succès.`, en: `Your group still needs to complete ${minSucc - s.successful_periods} due date(s) successfully.`, sw: `Kikundi chako bado kinahitaji kukamilisha awamu ${minSucc - s.successful_periods} kwa mafanikio.` }));
  }

  return (
    <section className="mt-6 px-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{L({ fr: "Éligibilité au crédit collectif", en: "Collective credit eligibility", sw: "Ustahiki wa mkopo wa kikundi" })}</h2>
        </div>
        {isLoading || !s ? (
          <p className="mt-3 text-sm text-muted-foreground">{isLoading ? L({ fr: "Calcul en cours…", en: "Calculating…", sw: "Inakokotoa…" }) : L({ fr: "Évaluation bientôt disponible.", en: "Assessment available soon.", sw: "Tathmini itapatikana hivi karibuni." })}</p>
        ) : (
          <>
            <div className={cn("mt-3 rounded-xl px-3 py-2.5 text-sm font-bold", s.eligible ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
              {s.eligible ? L({ fr: "GROUPE ÉLIGIBLE AU CRÉDIT COLLECTIF", en: "GROUP ELIGIBLE FOR COLLECTIVE CREDIT", sw: "KIKUNDI KINASTAHILI MKOPO WA KIKUNDI" }) : L({ fr: "GROUPE NON ENCORE ÉLIGIBLE", en: "GROUP NOT YET ELIGIBLE", sw: "KIKUNDI BADO HAKISTAHILI" })}
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs"><span>{L({ fr: "Progression vers l'éligibilité", en: "Progress towards eligibility", sw: "Maendeleo kuelekea ustahiki" })}</span><span className="font-mono">{s.progress} %</span></div>
              <Bar value={s.progress} ok={s.eligible} />
            </div>
            <ul className="mt-2 divide-y divide-border">
              <Row ok={s.c_age} label={L({ fr: "Ancienneté", en: "Seniority", sw: "Uzoefu" })} value={`${Math.min(s.age_months, minAge)} / ${minAge} ${L({ fr: "mois", en: "months", sw: "miezi" })}`} pct={(s.age_months / minAge) * 100} />
              <Row ok={s.c_period_late} label={L({ fr: "Retards par échéance", en: "Late payments per due date", sw: "Ucheleweshaji kwa kila awamu" })} value={`${s.last_period_late} / ${maxPl} max`}
                pct={s.period_state === "ok" ? 100 : s.period_state === "recovering" ? (s.recovery_streak / rec) * 100 : 0}
                note={s.period_state === "recovering" ? `${L({ fr: "En récupération", en: "Recovering", sw: "Inarejeshwa" })} (${s.recovery_streak}/${rec})` : s.period_state === "restricted" ? L({ fr: "Restriction temporaire", en: "Temporary restriction", sw: "Kizuizi cha muda" }) : undefined} />
              <Row ok={s.c_year_late} label={`${L({ fr: "Retards", en: "Late payments", sw: "Ucheleweshaji" })} ${s.year}`} value={`${s.year_late} / ${maxYl} max`} pct={s.c_year_late ? 100 - (s.year_late / (maxYl + 1)) * 100 : 0} />
              <Row ok={s.c_members} label={L({ fr: "Membres actifs", en: "Active members", sw: "Wanachama hai" })} value={`${s.active_members} / ${minMem}`} pct={(s.active_members / minMem) * 100} />
              <Row ok={s.c_successful} label={L({ fr: "Échéances réussies", en: "Successful due dates", sw: "Awamu zilizofanikiwa" })} value={`${s.successful_periods} / ${minSucc}`} pct={(s.successful_periods / minSucc) * 100} />
            </ul>
            {reasons.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-xl bg-muted/60 p-3 text-xs">
                {reasons.map((r) => <li key={r}>• {r}</li>)}
              </ul>
            )}
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 flex w-full items-center justify-between text-xs font-semibold text-primary">
              {L({ fr: "Historique de performance", en: "Performance history", sw: "Historia ya utendaji" })}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
            {open && data && (
              <div className="mt-2 space-y-3 text-xs">
                {data.years.length > 0 && (
                  <div>
                    <p className="font-semibold">{L({ fr: "Retards par année", en: "Late payments per year", sw: "Ucheleweshaji kwa mwaka" })}</p>
                    {data.years.map((y) => <p key={y.year} className="flex justify-between"><span>{y.year}</span><span className="font-mono">{y.late}</span></p>)}
                  </div>
                )}
                <div>
                  <p className="font-semibold">{L({ fr: "Échéances terminées", en: "Completed due dates", sw: "Awamu zilizokamilika" })} ({s.closed_periods})</p>
                  {data.periods.length === 0 && <p className="text-muted-foreground">{L({ fr: "Aucune échéance terminée.", en: "No completed due dates.", sw: "Hakuna awamu iliyokamilika." })}</p>}
                  {data.periods.slice(0, 12).map((p) => (
                    <p key={p.idx} className="flex justify-between">
                      <span>N°{p.idx} · {formatDate(p.due_date)}</span>
                      <span className="font-mono">{p.late_count} {L({ fr: "retard(s)", en: "late", sw: "kuchelewa" })} {p.successful ? "✓" : ""}</span>
                    </p>
                  ))}
                </div>
                {data.events.length > 0 && (
                  <div>
                    <p className="font-semibold">{L({ fr: "Changements", en: "Changes", sw: "Mabadiliko" })}</p>
                    {data.events.map((e) => (
                      <p key={e.id}><span className="text-muted-foreground">{formatDate(e.created_at.slice(0, 10))} · </span>{lang === "fr" ? e.reason : eventLabel(e.kind, lang)}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
