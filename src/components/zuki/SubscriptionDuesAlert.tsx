import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import { listMySubscriptionDues } from "@/lib/tontines/subscription.functions";
import { SubscriptionPaySheet } from "./GroupSubscription";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });

/** Home alert: subscriptions the signed-in user must pay, and groups blocked by an unpaid subscription. */
export function SubscriptionDuesAlert() {
  const { formatDate } = useI18n();
  const qc = useQueryClient();
  const fetchDues = useServerFn(listMySubscriptionDues);
  const { data = [] } = useQuery({ queryKey: ["my-subscription-dues"], queryFn: () => fetchDues(), retry: false });
  const [paying, setPaying] = useState<(typeof data)[number] | null>(null);
  const mine = data.filter((d) => d.isPayer);
  const blockedOthers = data.filter((d) => !d.isPayer && d.status === "overdue");
  if (!mine.length && !blockedOthers.length) return null;

  return (
    <section className="mt-4 space-y-2 px-4">
      {mine.map((d) => (
        <div
          key={d.id}
          className={d.status === "overdue" ? "rounded-2xl bg-destructive p-4 text-destructive-foreground" : "rounded-2xl bg-coral p-4 text-coral-foreground"}
        >
          <p className="text-sm font-bold">
            {d.status === "overdue"
              ? L("ABONNEMENT DU GROUPE EN RETARD", "GROUP SUBSCRIPTION OVERDUE", "USAJILI WA KIKUNDI UMECHELEWA")
              : L("Abonnement du groupe non payé", "Group subscription unpaid", "Usajili wa kikundi haujalipwa")}
          </p>
          <p className="text-xs opacity-90">
            {d.groupName} · {d.amount} {d.currency} · {formatDate(d.dueDate)}
          </p>
          <button
            onClick={() => setPaying(d)}
            className="mt-3 h-11 w-full rounded-xl bg-background text-sm font-bold text-foreground"
          >
            {L("PAYER MAINTENANT", "PAY NOW", "LIPA SASA")}
          </button>
        </div>
      ))}
      {blockedOthers.map((d) => (
        <div key={d.id} className="rounded-2xl bg-card p-4 ring-1 ring-destructive">
          <p className="flex items-center gap-2 text-sm font-bold text-destructive">
            <Lock className="size-4" /> {d.groupName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {L(
              "Abonnement du groupe en retard. Le groupe sera disponible dès que l'abonnement aura été payé par le membre désigné.",
              "Group subscription overdue. The group will be available once the designated member pays the subscription.",
              "Usajili wa kikundi umechelewa. Kikundi kitapatikana mara mwanachama aliyeteuliwa atakapolipa.",
            )}
          </p>
        </div>
      ))}
      {paying && (
        <SubscriptionPaySheet
          subscriptionId={paying.id}
          amount={paying.amount}
          currency={paying.currency}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            void qc.invalidateQueries({ queryKey: ["my-subscription-dues"] });
            void qc.invalidateQueries({ queryKey: ["group-subscription"] });
          }}
        />
      )}
    </section>
  );
}
