/**
 * Single entry point for native (Capacitor) capabilities. Every feature falls back
 * to the web implementation when the app runs in a browser, so screens never need
 * to know where they run. Plugins get wired here once the Capacitor shell exists.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeApp(): boolean {
  return Boolean(cap()?.isNativePlatform?.());
}

export function platform(): "ios" | "android" | "web" {
  const p = cap()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

/** Capabilities available today; native plugins (push, camera, biometrics) extend these later. */
export function capabilities() {
  const hasNav = typeof navigator !== "undefined";
  return {
    share: hasNav && "share" in navigator,
    camera: hasNav && !!navigator.mediaDevices?.getUserMedia,
    webPush: typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator,
    webAuthn: typeof window !== "undefined" && "PublicKeyCredential" in window,
  };
}
