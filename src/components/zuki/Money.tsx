import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/zuki/engine";
import type { Currency } from "@/lib/zuki/types";
import { revealText, useReveal } from "@/lib/security/RevealProvider";
import { cn } from "@/lib/utils";

const MASK = "••••••";

type SectionCtx = { visible: boolean; toggle: (e?: React.SyntheticEvent) => void; busy: boolean };
const MoneySectionContext = createContext<SectionCtx | null>(null);

/** Shared visibility state for every amount of one section (independent of other sections). */
function useSectionState(): SectionCtx {
  const { requestReveal } = useReveal();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setVisible(false), [pathname]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") setVisible(false);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, []);

  async function toggle(e?: React.SyntheticEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (visible) return setVisible(false);
    if (busy) return;
    setBusy(true);
    const ok = await requestReveal();
    setBusy(false);
    if (ok) setVisible(true);
  }
  return { visible, toggle, busy };
}

/** Groups amounts: one eye (SectionEye / SectionTitle) reveals or masks all of them, after PIN/biometrics. */
export function MoneySection({ children }: { children: ReactNode }) {
  const ctx = useSectionState();
  return <MoneySectionContext.Provider value={ctx}>{children}</MoneySectionContext.Provider>;
}

export function useInMoneySection() {
  return useContext(MoneySectionContext) !== null;
}

/** The single eye button of the enclosing MoneySection. */
export function SectionEye({ className }: { className?: string }) {
  const ctx = useContext(MoneySectionContext);
  const { lang } = useI18n();
  const rt = revealText(lang);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={(e) => void ctx.toggle(e)}
      aria-label={ctx.visible ? rt.hide : rt.show}
      aria-pressed={ctx.visible}
      disabled={ctx.busy}
      className={cn(
        "inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-full opacity-80 hover:opacity-100",
        className,
      )}
    >
      {ctx.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  );
}

/** A protected amount. Inside a MoneySection it follows the section's single eye; it never has its own eye there. */
export function Money({
  value,
  currency,
  prefix = "",
  className,
}: {
  value: number;
  currency: Currency;
  prefix?: string;
  className?: string;
  iconClassName?: string;
}) {
  const section = useContext(MoneySectionContext);
  if (section) {
    return (
      <span className={cn("whitespace-nowrap", className)}>
        {section.visible ? prefix + formatMoney(value, currency) : MASK}
      </span>
    );
  }
  return <StandaloneMoney value={value} currency={currency} prefix={prefix} className={className} />;
}

/** Fallback for an isolated amount outside any section: acts as its own one-amount section. */
function StandaloneMoney({ value, currency, prefix, className }: { value: number; currency: Currency; prefix: string; className?: string | undefined }) {
  return (
    <MoneySection>
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
        <Money value={value} currency={currency} prefix={prefix} />
        <SectionEye className="size-6" />
      </span>
    </MoneySection>
  );
}

/** Replaces "{amount}" in a translated sentence with a protected amount. */
export function withMoney(text: string, value: number, currency: Currency): ReactNode {
  const [before, after = ""] = text.split("{amount}");
  if (!text.includes("{amount}")) return text;
  return (
    <>
      {before}
      <Money value={value} currency={currency} />
      {after}
    </>
  );
}
