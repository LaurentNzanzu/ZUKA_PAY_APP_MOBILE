import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { currentLang, pick } from "@/lib/i18n";
import { translateError } from "@/lib/i18n/errors";
import { getTransactionStatus } from "@/lib/payments/payments.functions";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });

export function errMsg(e: unknown) {
  return translateError(e);
}

/** Mobile Money sheet: collects the number, starts the payment, polls until final. */
export function PayFlowSheet({
  title,
  amount,
  currency,
  children,
  start,
  onClose,
  onDone,
}: {
  title: string;
  amount: number;
  currency: string;
  children?: ReactNode;
  start: (msisdn: string, key: string) => Promise<{ reference: string; status: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const status = useServerFn(getTransactionStatus);
  const [msisdn, setMsisdn] = useState("+243");
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    try {
      const tx = await start(msisdn, `${title}-${Date.now()}`);
      const deadline = Date.now() + 120_000;
      let st = tx.status;
      while (!["SUCCESS", "FAILED", "CANCELLED", "EXPIRED"].includes(st) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        st = (await status({ data: { reference: tx.reference } })).status;
      }
      if (st === "SUCCESS") {
        toast.success(L("Paiement confirmé.", "Payment confirmed.", "Malipo yamethibitishwa."), { description: tx.reference });
        onDone();
      } else {
        toast.error(L("Paiement non confirmé.", "Payment not confirmed.", "Malipo hayajathibitishwa."));
        onClose();
      }
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/40" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 font-display text-3xl text-deep">
          {amount} {currency}
        </p>
        {children}
        <label className="mt-4 block text-xs text-muted-foreground">
          {L("Numéro Mobile Money", "Mobile Money number", "Namba ya Mobile Money")}
          <input
            className="mt-1 h-12 w-full rounded-xl bg-card px-3 font-mono text-sm ring-1 ring-line outline-none"
            inputMode="tel"
            value={msisdn}
            onChange={(e) => setMsisdn(e.target.value.replace(/[^\d+]/g, ""))}
          />
        </label>
        <button
          disabled={busy}
          onClick={pay}
          className="mt-4 h-14 w-full rounded-2xl bg-coral text-base font-bold text-coral-foreground disabled:opacity-60"
        >
          {busy
            ? L("Confirmez sur votre téléphone…", "Confirm on your phone…", "Thibitisha kwenye simu yako…")
            : L("PAYER MAINTENANT", "PAY NOW", "LIPA SASA")}
        </button>
      </div>
    </div>
  );
}
