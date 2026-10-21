/** Temporary access for the local editor and private preview only; never the published site nor a native app. */
export const TEST_ACCESS_ENABLED = true;

function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function isTestAccessHost(hostname: string): boolean {
  if (isNativeShell()) return false;
  return hostname === "localhost" || hostname === "127.0.0.1" || /^id-preview--[0-9a-f-]+\.lovable\.app$/.test(hostname);
}
