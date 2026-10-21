import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ContributionStatus } from "@/lib/zuki/types";

const styles: Record<ContributionStatus, string> = {
  paid: "bg-ok/10 text-ok",
  partial: "bg-warn/10 text-warn",
  late: "bg-bad/10 text-bad",
  pending: "bg-wait/10 text-wait",
};

const labels = {
  paid: "status.paid",
  partial: "status.partial",
  late: "status.late",
  pending: "status.pending",
} as const;

export function StatusChip({ status, className }: { status: ContributionStatus; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide",
        styles[status],
        className,
      )}
    >
      {t(labels[status])}
    </span>
  );
}

export function Avatar({ name, status }: { name: string; status?: ContributionStatus }) {
  const tone = status ? styles[status] : "bg-lagoon/10 text-lagoon";
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold", tone)}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
