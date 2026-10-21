import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, LoaderCircle, ScanFace, ShieldCheck } from "lucide-react";
import splashLogo from "@/assets/zuka-pay-splash-logo.jpeg.asset.json";
import { Button } from "@/components/ui/button";
import { PinDots, PinPad } from "@/components/zuki/PinPad";
import { useI18n } from "@/lib/i18n";
import { useLock } from "@/lib/security/LockProvider";
import {
  biometricsAvailable,
  biometricsEnabled,
  enableBiometrics,
  isValidPin,
  isWeakPin,
  lockoutRemaining,
  unlockWithBiometrics,
  verifyPin,
} from "@/lib/security/lock";
import { formatWait, lockText } from "@/lib/security/lockText";

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="safe-top safe-bottom fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-background px-5 py-8">
      <div className="w-full max-w-sm">
        <div className="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl bg-splash shadow-card">
          <img src={splashLogo.url} alt="" width={1536} height={1707} className="h-full w-full object-cover" />
        </div>
        <div className="mt-6 text-center">
          <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            {subtitle}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

/** Unlock screen for a returning, still-signed-in user. */
export function UnlockScreen() {
  const { lang } = useI18n();
  const tx = lockText(lang);
  const { markUnlocked, signOutAndForget, userId } = useLock();

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(() => lockoutRemaining());
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    let active = true;
    void biometricsAvailable().then((available) => {
      if (!active || !userId) return;
      const enabled = available && biometricsEnabled(userId);
      setBio(enabled);
      if (enabled && !attempted.current && lockoutRemaining() === 0) {
        attempted.current = true;
        void tryBiometrics();
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setInterval(() => setWait(lockoutRemaining()), 1000);
    return () => window.clearInterval(id);
  }, [wait]);

  const tryBiometrics = useCallback(async () => {
    setBusy(true);
    const ok = await unlockWithBiometrics();
    setBusy(false);
    if (ok) markUnlocked();
    else setError(tx.bioFailed);
  }, [markUnlocked, tx.bioFailed]);

  const submit = useCallback(
    async (value: string) => {
      if (!isValidPin(value)) {
        setError(tx.needFour);
        return;
      }
      setBusy(true);
      const result = await verifyPin(value);
      setBusy(false);
      if (result.ok) {
        markUnlocked();
        return;
      }
      setPin("");
      if (result.reason === "locked" || (result.reason === "wrong" && result.waitMs > 0)) {
        const ms = result.reason === "locked" ? result.waitMs : result.waitMs;
        setWait(ms);
        setError(tx.lockedFor(formatWait(ms)));
        return;
      }
      setError(
        result.reason === "wrong"
          ? `${tx.wrong} ${result.attemptsLeft > 0 ? tx.attemptsLeft(result.attemptsLeft) : ""}`.trim()
          : tx.wrong,
      );
    },
    [markUnlocked, tx],
  );

  function push(d: string) {
    setError(null);
    setPin((current) => {
      const next = (current + d).slice(0, 4);
      if (next.length === 4) void submit(next);
      return next;
    });
  }

  const blocked = wait > 0 || busy;

  return (
    <Frame title={tx.welcome} subtitle={bio ? tx.unlockTitle : tx.enterPin}>
      <div className="mt-8">
        <PinDots length={pin.length} error={!!error} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-center text-sm font-medium text-bad">
          {error}
        </p>
      )}
      {wait > 0 && (
        <p className="mt-2 text-center text-sm text-muted-foreground">{tx.lockedFor(formatWait(wait))}</p>
      )}

      {bio && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void tryBiometrics()}
          disabled={blocked}
          className="mt-5 h-12 w-full rounded-xl font-semibold"
        >
          {busy ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <>
              <ScanFace aria-hidden="true" />
              <Fingerprint aria-hidden="true" />
            </>
          )}
          {tx.useBiometrics}
        </Button>
      )}

      <PinPad
        onDigit={push}
        onBackspace={() => {
          setError(null);
          setPin((c) => c.slice(0, -1));
        }}
        onSubmit={() => void submit(pin)}
        disabled={blocked}
        submitLabel={tx.submit}
        backLabel={tx.back}
      />

      <button
        type="button"
        onClick={() => void signOutAndForget()}
        className="mx-auto mt-6 block text-sm font-semibold text-lagoon underline-offset-4 hover:underline"
      >
        {tx.forgot}
      </button>
    </Frame>
  );
}

/** First-run PIN creation, then optional biometric enrolment. */
export function CreatePinScreen() {
  const { lang } = useI18n();
  const tx = lockText(lang);
  const { createPin, markUnlocked, userId, displayName } = useLock();

  const [step, setStep] = useState<"create" | "confirm" | "bio">("create");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    void biometricsAvailable().then(setBioAvailable);
  }, []);

  const commit = useCallback(
    async (value: string) => {
      if (step === "create") {
        if (!isValidPin(value)) {
          setError(tx.needFour);
          setPin("");
          return;
        }
        if (isWeakPin(value)) {
          setError(tx.weak);
          setPin("");
          return;
        }
        setFirst(value);
        setPin("");
        setError(null);
        setStep("confirm");
        return;
      }

      if (value !== first) {
        setError(tx.mismatch);
        setPin("");
        setFirst("");
        setStep("create");
        return;
      }

      setBusy(true);
      await createPin(value);
      setBusy(false);
      if (bioAvailable && userId) {
        setStep("bio");
        return;
      }
      markUnlocked();
    },
    [bioAvailable, createPin, first, markUnlocked, step, tx, userId],
  );

  function push(d: string) {
    setError(null);
    setPin((current) => {
      const next = (current + d).slice(0, 4);
      if (next.length === 4) void commit(next);
      return next;
    });
  }

  if (step === "bio") {
    return (
      <Frame title={tx.enableBioQuestion} subtitle={tx.enableBioHint}>
        <div className="mt-8 grid gap-3">
          <Button
            type="button"
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await enableBiometrics(userId!, displayName);
              setBusy(false);
              markUnlocked();
            }}
            className="h-12 w-full rounded-xl font-semibold"
          >
            {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            <Fingerprint aria-hidden="true" />
            {tx.enable}
          </Button>
          <Button type="button" variant="ghost" onClick={markUnlocked} className="w-full">
            {tx.later}
          </Button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      title={step === "create" ? tx.createTitle : tx.confirmTitle}
      subtitle={step === "create" ? tx.createHint : tx.confirmHint}
    >
      <div className="mt-8">
        <PinDots length={pin.length} error={!!error} />
      </div>
      {error && (
        <p role="alert" className="mt-4 text-center text-sm font-medium text-bad">
          {error}
        </p>
      )}
      <PinPad
        onDigit={push}
        onBackspace={() => {
          setError(null);
          setPin((c) => c.slice(0, -1));
        }}
        onSubmit={() => void commit(pin)}
        disabled={busy}
        submitLabel={tx.submit}
        backLabel={tx.back}
      />
    </Frame>
  );
}
