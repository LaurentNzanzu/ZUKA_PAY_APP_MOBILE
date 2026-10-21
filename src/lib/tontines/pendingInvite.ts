/** Keeps an invitation token across sign-in / sign-up so the user lands back on the invited group. */
const KEY = "zuka.pendingInvite";
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function savePendingInvite(token: string) {
  if (typeof window === "undefined" || !TOKEN_RE.test(token)) return;
  window.localStorage.setItem(KEY, JSON.stringify({ token, at: Date.now() }));
}

/** Returns and clears a pending token (valid for 30 days). */
export function takePendingInvite(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  window.localStorage.removeItem(KEY);
  try {
    const { token, at } = JSON.parse(raw ?? "null") ?? {};
    if (typeof token === "string" && TOKEN_RE.test(token) && Date.now() - at < 30 * 864e5) return token;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearPendingInvite() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
