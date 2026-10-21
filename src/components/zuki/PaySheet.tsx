import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { formatMoney, paidBy, penaltyFor } from "@/lib/zuki/engine";
import type { Group } from "@/lib/zuki/types";

interface Props {
  group: Group;
  dueId: string;
  open: boolean;
  onClose: () => void;
}

export function PaySheet({ group, dueId, open, onClose }: Props) {
  const { t, L } = useI18n();
  const { pay, me } = useZuki();
  const already = paidBy(group, dueId, me.id);
  const remaining = Math.max(group.amount - already, 0);
  const penalty = penaltyFor(group, dueId, me.id);

  const [amount, setAmount] = useState(String(remaining));
  const [msisdn, setMsisdn] = useState(me.phone);
  const [state, setState] = useState<"idle" | "processing" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(remaining));
      setState("idle");
      setError(null);
    }
  }, [open, remaining]);

  if (!open) return null;

  const value = Number(amount);
  const invalid = !Number.isFinite(value) || value <= 0 || value > remaining;
  const total = (Number.isFinite(value) ? value : 0) + penalty.amount;

  const submit = async () => {
    if (state === "processing" || invalid) return; // idempotency guard against double taps
    setState("processing");
    setError(null);
    const res = await pay({ groupId: group.id, dueId, amount: value, msisdn });
    if (res.ok) {
      toast.success(t("pay.success"), { description: res.ref });
      onClose();
      setState("idle");
    } else {
      setState("failed");
      setError(
        res.message ??
          (res.status === "PENDING" || res.status === "PROCESSING"
            ? L({ fr: "Confirmation Mobile Money non reçue. Validez la demande sur votre téléphone puis réessayez.", en: "Mobile Money confirmation not received. Approve the request on your phone and try again.", sw: "Uthibitisho wa Mobile Money haujapokelewa. Kubali ombi kwenye simu yako kisha ujaribu tena." })
            : L({ fr: "Paiement non confirmé par l'opérateur.", en: "Payment not confirmed by the operator.", sw: "Malipo hayajathibitishwa na mtoa huduma." })),
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        className="w-full max-w-[430px] rounded-t-3xl bg-card p-5 animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{t("pay.title")}</h2>
            <p className="font-mono text-[11px] text-muted-foreground">{group.name}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.cancel")} className="text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("pay.remaining")}
          </p>
          <p className="font-display text-3xl leading-none text-deep">
            {formatMoney(remaining, group.currency)}
          </p>
        </div>

        <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="msisdn">
          {t("pay.number")}
        </label>
        <input
          id="msisdn"
          inputMode="tel"
          value={msisdn}
          onChange={(e) => setMsisdn(e.target.value.slice(0, 20))}
          className="mt-1 h-12 w-full rounded-xl bg-background px-3 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon"
        />

        <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="amount">
          {t("pay.amount")}
        </label>
        <input
          id="amount"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
          className="mt-1 h-12 w-full rounded-xl bg-background px-3 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t("pay.partialHint")}</p>

        <div className="mt-3 space-y-1 rounded-2xl bg-background p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("penalty.contribution")}</span>
            <span className="font-mono">{formatMoney(Number.isFinite(value) ? value : 0, group.currency)}</span>
          </div>
          {penalty.amount > 0 && (
            <div className="flex justify-between text-destructive">
              <span>
                {t("penalty.late")} · {penalty.daysLate} {t("penalty.daysLate")}
              </span>
              <span className="font-mono">{formatMoney(penalty.amount, group.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-1 font-semibold">
            <span>{t("penalty.total")}</span>
            <span className="font-mono">{formatMoney(total, group.currency)}</span>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={invalid || state === "processing"}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-coral text-base font-semibold tracking-wide text-coral-foreground transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {state === "processing" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("pay.processing")}
            </>
          ) : state === "failed" ? (
            t("pay.retry")
          ) : penalty.amount > 0 ? (
            `${t("penalty.payNow")} · ${formatMoney(total, group.currency)}`
          ) : (
            t("pay.confirm")
          )}
        </button>
        {error && (
          <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-center text-[12px] text-destructive">
            {error}
          </p>
        )}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3" /> {t("pay.instruction")}
        </p>
      </div>
    </div>
  );
}
