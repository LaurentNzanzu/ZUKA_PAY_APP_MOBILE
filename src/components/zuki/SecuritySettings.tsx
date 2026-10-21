import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { useLock } from "@/lib/security/LockProvider";
import {
  biometricsAvailable,
  biometricsEnabled,
  disableBiometrics,
  enableBiometrics,
} from "@/lib/security/lock";
import { lockText } from "@/lib/security/lockText";

export function SecuritySettings() {
  const { lang } = useI18n();
  const tx = lockText(lang);
  const { userId, displayName, startPinChange, signOutAndForget } = useLock();

  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void biometricsAvailable().then(setAvailable);
    if (userId) setEnabled(biometricsEnabled(userId));
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="mt-4 rounded-2xl bg-card ring-1 ring-line">
      <p className="px-3 pt-3 text-xs font-medium text-muted-foreground">{tx.security}</p>

      <button
        type="button"
        onClick={startPinChange}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-background"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/12 text-lagoon">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <span className="flex-1 text-sm font-semibold">{tx.changePin}</span>
      </button>

      {available && (
        <div className="flex items-center gap-3 border-t border-line p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/12 text-lagoon">
            <Fingerprint className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{tx.biometrics}</p>
            <p className="text-xs text-muted-foreground">{tx.enableBioHint}</p>
          </div>
          <Switch
            checked={enabled}
            aria-label={tx.biometrics}
            className="data-[state=unchecked]:bg-muted"
            onCheckedChange={async (checked) => {
              if (!checked) {
                disableBiometrics();
                setEnabled(false);
                return;
              }
              const ok = await enableBiometrics(userId, displayName);
              setEnabled(ok);
              if (!ok) toast.error(tx.bioFailed);
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => void signOutAndForget()}
        className="flex w-full items-center gap-3 border-t border-line p-3 text-left transition-colors active:bg-background"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bad/12 text-bad">
          <LogOut className="size-5" aria-hidden="true" />
        </span>
        <span className="flex-1 text-sm font-semibold text-bad">{tx.signOut}</span>
      </button>
    </div>
  );
}
