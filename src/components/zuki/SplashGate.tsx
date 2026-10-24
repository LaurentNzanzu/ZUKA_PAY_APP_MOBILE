import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import zukaLogo from "@/assets/zuka-logo.png";
import { CreatePinScreen, UnlockScreen } from "@/components/zuki/LockScreen";
import { useLock } from "@/lib/security/LockProvider";
import { cn } from "@/lib/utils";
import { currentLang, pick } from "@/lib/i18n";

const MINIMUM_DISPLAY_MS = 900;
const EXIT_DURATION_MS = 220;

export function SplashGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const isAdmin = pathname.startsWith("/admin");
  const { status } = useLock();

  const [visible, setVisible] = useState(() => !isAdmin);
  const [leaving, setLeaving] = useState(false);
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setElapsed(true), MINIMUM_DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [isAdmin]);

  // Hide the splash once the animation played and the session state is known.
  useEffect(() => {
    if (isAdmin || !visible || !elapsed || status === "loading") return;
    setLeaving(true);
    const id = window.setTimeout(() => setVisible(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [elapsed, isAdmin, status, visible]);

  // Invitation pages stay readable signed-out (the invite is kept for after sign-in).
  const isInvite = pathname.startsWith("/rejoindre/");

  // Signed-out users go to the phone sign-in flow.
  useEffect(() => {
    if (isAdmin || isInvite || status !== "signedOut" || pathname === "/connexion") return;
    void navigate({ to: "/connexion", replace: true });
  }, [isAdmin, isInvite, navigate, pathname, status]);

  const locked = !isAdmin && (status === "locked" || status === "needsSetup");

  return (
    <>
      {locked ? (
        status === "locked" ? (
          <UnlockScreen />
        ) : (
          <CreatePinScreen />
        )
      ) : (
        children
      )}
      {visible && (
        <div
          className={cn("zuka-splash safe-top safe-bottom", leaving && "zuka-splash--leaving")}
          role="status"
          aria-label={pick(currentLang(), { fr: "Chargement de ZUKA PAY", en: "Loading ZUKA PAY", sw: "Inapakia ZUKA PAY" })}
        >
          <img
            src={zukaLogo}
            alt="ZUKA PAY"
            width={960}
            height={1093}
            className="zuka-splash__logo"
          />
        </div>
      )}
    </>
  );
}
