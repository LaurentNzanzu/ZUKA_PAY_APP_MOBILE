import { Check, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinDots({ length, error }: { length: number; error?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "size-4 rounded-full ring-1 transition-colors",
            error
              ? "bg-bad/70 ring-bad"
              : i < length
                ? "bg-lagoon ring-lagoon"
                : "bg-transparent ring-line",
          )}
        />
      ))}
    </div>
  );
}

export function PinPad({
  onDigit,
  onBackspace,
  onSubmit,
  disabled,
  submitLabel,
  backLabel,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel: string;
  backLabel: string;
}) {
  const keyCls =
    "h-16 rounded-2xl bg-card font-display text-2xl font-semibold text-foreground ring-1 ring-line transition-colors active:bg-lagoon/12 disabled:opacity-40";

  return (
    <div dir="ltr" className="mx-auto mt-8 grid w-full max-w-xs grid-cols-3 gap-3">
      {KEYS.map((k) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)} className={keyCls}>
          {k}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        aria-label={backLabel}
        className={cn(keyCls, "grid place-items-center")}
      >
        <Delete className="size-6" aria-hidden="true" />
      </button>
      <button type="button" disabled={disabled} onClick={() => onDigit("0")} className={keyCls}>
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        aria-label={submitLabel}
        className="grid h-16 place-items-center rounded-2xl bg-lagoon text-primary-foreground transition-opacity active:opacity-80 disabled:opacity-40"
      >
        <Check className="size-6" aria-hidden="true" />
      </button>
    </div>
  );
}
