import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Fingerprint, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { PinDots, PinPad } from "@/components/zuki/PinPad";
import { useI18n, type Lang } from "@/lib/i18n";
import { useLock } from "@/lib/security/LockProvider";
import {
  biometricsAvailable,
  biometricsEnabled,
  lockoutRemaining,
  unlockWithBiometrics,
  verifyPin,
} from "@/lib/security/lock";
import { formatWait, lockText } from "@/lib/security/lockText";

const TXT: Record<Lang, { title: string; hint: string; cancel: string; show: string; hide: string; noPin: string }> = {
  fr: {
    title: "Afficher ce montant",
    hint: "Confirmez votre identité avec votre code PIN ou la biométrie.",
    cancel: "Annuler",
    show: "Afficher le montant",
    hide: "Masquer le montant",
    noPin: "Créez d'abord votre code PIN pour afficher les montants.",
  },
  en: {
    title: "Show this amount",
    hint: "Confirm your identity with your PIN or biometrics.",
    cancel: "Cancel",
    show: "Show amount",
    hide: "Hide amount",
    noPin: "Create your PIN first to show amounts.",
  },
  sw: {
    title: "Onyesha kiasi hiki",
    hint: "Thibitisha utambulisho wako kwa PIN au bayometriki.",
    cancel: "Ghairi",
    show: "Onyesha kiasi",
    hide: "Ficha kiasi",
    noPin: "Unda PIN yako kwanza ili kuonyesha kiasi.",
  },
};

export function revealText(lang: Lang) {
  return TXT[lang] ?? TXT.fr;
}

type Ctx = { requestReveal: () => Promise<boolean> };
const RevealContext = createContext<Ctx | null>(null);

export function RevealProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const requestReveal = useCallback(() => {
    resolver.current?.(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && resolver.current) finish(false);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [finish]);

  return (
    <RevealContext.Provider value={{ requestReveal }}>
      {children}
      {open && <RevealDialog onDone={finish} />}
    </RevealContext.Provider>
  );
}

export function useReveal(): Ctx {
  const ctx = useContext(RevealContext);
  return ctx ?? { requestReveal: async () => false };
}

function RevealDialog({ onDone }: { onDone: (ok: boolean) => void }) {
  const { lang } = useI18n();
  const tx = lockText(lang);
  const rt = revealText(lang);
  const { userId } = useLock();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(() => lockoutRemaining());
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);

  useEffect(() => {
    let active = true;
    void biometricsAvailable().then((ok) => {
      if (active && userId) setBio(ok && biometricsEnabled(userId));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setInterval(() => setWait(lockoutRemaining()), 1000);
    return () => window.clearInterval(id);
  }, [wait]);

  async function submit(value: string) {
    if (value.length !== 4 || busy) return;
    setBusy(true);
    const res = await verifyPin(value);
    setBusy(false);
    setPin("");
    if (res.ok) return onDone(true);
    if (res.reason === "no-pin") return setError(rt.noPin);
    if (res.reason === "locked") {
      setWait(res.waitMs);
      return setError(null);
    }
    if (res.waitMs > 0) {
      setWait(res.waitMs);
      setError(null);
    } else {
      setError(`${tx.wrong} ${tx.attemptsLeft(res.attemptsLeft)}`);
    }
  }

  async function tryBio() {
    setBusy(true);
    const ok = await unlockWithBiometrics();
    setBusy(false);
    if (ok) onDone(true);
    else setError(tx.bioFailed);
  }

  const locked = wait > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={rt.title}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center"
      onClick={() => onDone(false)}
    >
      <div
        className="safe-bottom w-full max-w-sm rounded-t-3xl bg-background p-5 shadow-card sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">{rt.title}</h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              {rt.hint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDone(false)}
            aria-label={rt.cancel}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-card ring-1 ring-line"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6">
          <PinDots length={pin.length} error={!!error} />
        </div>
        <p className="mt-3 min-h-5 text-center text-xs text-bad" role="alert">
          {locked ? tx.lockedFor(formatWait(wait)) : error}
        </p>

        <PinPad
          disabled={busy || locked}
          submitLabel={tx.submit}
          backLabel={tx.back}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onSubmit={() => void submit(pin)}
          onDigit={(d) => {
            setError(null);
            setPin((p) => {
              if (p.length >= 4) return p;
              const next = p + d;
              if (next.length === 4) void submit(next);
              return next;
            });
          }}
        />

        {bio && (
          <button
            type="button"
            disabled={busy || locked}
            onClick={() => void tryBio()}
            className="mx-auto mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-lagoon disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
            {tx.useBiometrics}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDone(false)}
          className="mx-auto mt-2 block px-4 py-2 text-sm text-muted-foreground"
        >
          {rt.cancel}
        </button>
      </div>
    </div>
  );
}
