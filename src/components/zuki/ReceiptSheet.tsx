import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Printer, Share2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  buildReceipt,
  canShareFiles,
  downloadReceipt,
  printReceipt,
  shareReceipt,
} from "@/lib/zuki/receipt";
import type { Group, Transaction } from "@/lib/zuki/types";

interface Props {
  group: Group;
  tx: Transaction;
  open: boolean;
  onClose: () => void;
}

export function ReceiptSheet({ group, tx, open, onClose }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"download" | "share" | "print" | null>(null);
  if (!open) return null;

  const receipt = buildReceipt(group, tx);
  const shareable = canShareFiles();

  const run = async (kind: "download" | "share" | "print", fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
      if (kind === "download") toast.success(t("receipt.downloaded"));
    } catch {
      toast.error(t("receipt.error"));
    } finally {
      setBusy(null);
    }
  };

  const rows: Array<[string, string]> = [
    [t("receipt.id"), receipt.id],
    [t("receipt.reference"), receipt.reference],
    ...(receipt.penaltyAmount > 0
      ? ([
          [t("penalty.contribution"), `${new Intl.NumberFormat("fr-FR").format(receipt.contributionAmount)} ${receipt.currency}`],
          [t("penalty.late"), `${new Intl.NumberFormat("fr-FR").format(receipt.penaltyAmount)} ${receipt.currency}`],
          [t("penalty.daysLate"), String(receipt.daysLate)],
        ] as Array<[string, string]>)
      : []),
    ...(receipt.providerReference
      ? ([[t("receipt.providerRef"), receipt.providerReference]] as Array<[string, string]>)
      : []),
    [t("receipt.date"), new Date(receipt.createdAt).toLocaleString("fr-FR")],
    [t("receipt.kind"), receipt.kind],
    [t("receipt.method"), receipt.method],
    [t("receipt.sender"), `${receipt.payerName} · ${receipt.payerPhone}`],
    [t("receipt.beneficiary"), `${receipt.beneficiaryName} · ${receipt.beneficiaryPhone}`],
    [t("receipt.group"), receipt.groupName],
    [t("receipt.due"), receipt.dueLabel],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-card p-5 animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{t("receipt.title")}</h2>
            <p className="font-mono text-[11px] text-muted-foreground">{receipt.reference}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.cancel")} className="text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {receipt.statusLabel}
          </p>
          <p
            className={cn(
              "font-display text-3xl leading-none",
              receipt.status === "SUCCESS"
                ? "text-ok"
                : receipt.status === "FAILED" || receipt.status === "CANCELLED" || receipt.status === "EXPIRED"
                  ? "text-bad"
                  : "text-warn",
            )}
          >
            {new Intl.NumberFormat("fr-FR").format(receipt.amount)} {receipt.currency}
          </p>
        </div>

        <dl className="mt-4 divide-y divide-line rounded-2xl bg-background px-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3 py-2.5">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="text-right font-mono text-[11px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {receipt.status === "SUCCESS" ? t("receipt.noteOk") : t("receipt.notePending")}
        </p>

        <button
          onClick={() => run("download", () => downloadReceipt(receipt))}
          disabled={busy !== null}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-coral text-base font-semibold text-coral-foreground transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {busy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-5" />}
          {t("receipt.download")}
        </button>

        <div className={cn("mt-2 grid gap-2", shareable ? "grid-cols-2" : "grid-cols-1")}>
          {shareable && (
            <button
              onClick={() => run("share", () => shareReceipt(receipt))}
              disabled={busy !== null}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-background text-sm font-semibold ring-1 ring-line disabled:opacity-50"
            >
              {busy === "share" ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              {t("receipt.share")}
            </button>
          )}
          <button
            onClick={() => run("print", () => printReceipt(receipt))}
            disabled={busy !== null}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-background text-sm font-semibold ring-1 ring-line disabled:opacity-50"
          >
            {busy === "print" ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            {t("receipt.print")}
          </button>
        </div>
      </div>
    </div>
  );
}
