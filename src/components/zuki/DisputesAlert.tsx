import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import { listMyDisputes, payDebt } from "@/lib/tontines/disputes.functions";
import { PayFlowSheet } from "./PayFlowSheet";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });

/** Home: active disputes in mandatory priority order, and advances owed to me. */
export function DisputesAlert() {
  const { formatDate } = useI18n();
  const qc = useQueryClient();
  const fetch = useServerFn(listMyDisputes);
  const pay = useServerFn(payDebt);
  const { data } = useQuery({ queryKey: ["my-disputes"], queryFn: () => fetch(), retry: false });
  const [paying, setPaying] = useState<{ id: string; amount: number; currency: string } | null>(null);
  const disputes = data?.disputes ?? [];
  const credits = (data?.credits ?? []).filter((c: { status: string }) => c.status === "active");
  if (!disputes.length && !credits.length) return null;

  return (
    <section className="mt-4 space-y-2 px-4">
      {disputes.length > 0 && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-destructive">
          <p className="flex items-center gap-2 text-sm font-bold text-destructive">
            <AlertTriangle className="size-4" /> {L("LITIGES ACTIFS — À RÉGLER EN PRIORITÉ", "ACTIVE DISPUTES — SETTLE FIRST", "MADENI — LIPA KWANZA")}
          </p>
          <ol className="mt-2 space-y-2">
            {disputes.map((d, i) => (
              <li key={d.kind + d.id} className="rounded-xl bg-background p-3 text-sm">
                <p className="font-semibold">
                  {i + 1}. {d.label.toUpperCase()} — {d.amount} {d.currency}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.groupName} · {formatDate(d.since)} · {L("Destinataire", "Recipient", "Mpokeaji")} : {d.destination}
                </p>
                {i === 0 && d.kind === "debt" && (
                  <button
                    onClick={() => setPaying({ id: d.id, amount: d.amount, currency: d.currency })}
                    className="mt-2 h-10 w-full rounded-xl bg-destructive text-sm font-bold text-destructive-foreground"
                  >
                    {L("RÉGLER CE LITIGE", "SETTLE THIS DISPUTE", "LIPA DENI HILI")}
                  </button>
                )}
                {i === 0 && d.kind !== "debt" && (
                  <p className="mt-1 text-xs text-destructive">
                    {L("À payer depuis la page du groupe, avant tout nouveau paiement.", "Pay from the group page before any new payment.", "Lipa kwenye ukurasa wa kikundi kabla ya malipo mapya.")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {credits.map((c: any) => (
        <div key={c.id} className="rounded-2xl bg-card p-3 text-xs ring-1 ring-line">
          <p className="font-semibold text-foreground">
            {L("Avance à récupérer", "Advance to recover", "Mkopo wa kurudishiwa")} · {c.groupName}
          </p>
          <p className="text-muted-foreground">
            {c.paid}/{c.total} {c.currency} {c.rate > 0 ? `(${L("intérêt", "interest", "riba")} ${c.rate} %)` : ""} · {L("reste", "left", "baki")} {c.remaining}
          </p>
        </div>
      ))}
      {paying && (
        <PayFlowSheet
          title={L("Rembourser l'avance", "Repay the advance", "Rudisha mkopo")}
          amount={paying.amount}
          currency={paying.currency}
          start={(msisdn, key) => pay({ data: { debtId: paying.id, amount: paying.amount, msisdn, idempotencyKey: key } })}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            void qc.invalidateQueries({ queryKey: ["my-disputes"] });
          }}
        />
      )}
    </section>
  );
}
