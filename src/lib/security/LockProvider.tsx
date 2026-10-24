import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { startTestSession } from "@/lib/auth/dev-login.functions";
import { isTestAccessHost, TEST_ACCESS_ENABLED } from "@/lib/auth/test-access";
import { clearLock, hasPinFor, setPin as persistPin } from "./lock";

export type LockStatus = "loading" | "signedOut" | "needsSetup" | "locked" | "unlocked";

/** Re-lock when the app comes back to the foreground after this delay. */
const BACKGROUND_GRACE_MS = 60_000;

type LockContextValue = {
  status: LockStatus;
  userId: string | null;
  displayName: string;
  markUnlocked: () => void;
  createPin: (pin: string) => Promise<void>;
  startPinChange: () => void;
  lockNow: () => void;
  signOutAndForget: () => Promise<void>;
};

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LockStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("ZUKA PAY");
  const hiddenAt = useRef<number | null>(null);
  const testAttempted = useRef(false);
  const signOutInProgress = useRef(false);

  const applySession = useCallback((uid: string | null, name: string) => {
    setUserId(uid);
    setDisplayName(name || "ZUKA PAY");
    if (!uid) {
      setStatus("signedOut");
      return;
    }
    setStatus(hasPinFor(uid) ? "locked" : "needsSetup");
  }, []);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const user = data.session?.user ?? null;
      if (user) {
        applySession(user.id, user.phone ?? user.email ?? "ZUKA PAY");
        return;
      }
      if (!TEST_ACCESS_ENABLED || !isTestAccessHost(window.location.hostname) || testAttempted.current || signOutInProgress.current) {
        applySession(null, "ZUKA PAY");
        return;
      }
      testAttempted.current = true;
      try {
        const { tokenHash } = await startTestSession();
        const { data: verified, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
        if (error || !verified.user) throw error ?? new Error("Session de test indisponible");
        if (active) applySession(verified.user.id, verified.user.email ?? "ZUKA PAY");
      } catch (error) {
        console.error("Accès de test indisponible", error);
        if (active) applySession(null, "ZUKA PAY");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const user = session?.user ?? null;
      applySession(user?.id ?? null, user?.phone ?? user?.email ?? "ZUKA PAY");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (away >= BACKGROUND_GRACE_MS && userId && hasPinFor(userId)) setStatus("locked");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId]);

  const value = useMemo<LockContextValue>(
    () => ({
      status,
      userId,
      displayName,
      markUnlocked: () => setStatus("unlocked"),
      createPin: async (pin: string) => {
        let uid = userId;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id ?? null;
          if (uid) setUserId(uid);
        }
        if (!uid) throw new Error("NO_SESSION");
        await persistPin(uid, pin);
        setStatus("unlocked");
      },
      startPinChange: () => {
        if (userId) setStatus("needsSetup");
      },
      lockNow: () => {
        if (userId && hasPinFor(userId)) setStatus("locked");
      },
      signOutAndForget: async () => {
        signOutInProgress.current = true;
        clearLock();
        await supabase.auth.signOut();
        setUserId(null);
        setStatus("signedOut");
      },
    }),
    [status, userId, displayName],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockContextValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used inside LockProvider");
  return ctx;
}
