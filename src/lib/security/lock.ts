const STORAGE_KEY = "zuka.lock.v1";
const ITERATIONS = 150_000;

export type LockRecord = {
  userId: string;
  salt: string;
  hash: string;
  iterations: number;
  fails: number;
  lockedUntil: number | null;
  credentialId: string | null;
};

/** Progressive lockout, in milliseconds, applied from the 3rd consecutive failure. */
const DELAYS = [30_000, 60_000, 300_000, 900_000, 1_800_000];

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of view) out += String.fromCharCode(b);
  return btoa(out);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1212", "0123"]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toB64(bits);
}

export function readLock(): LockRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockRecord;
    if (!parsed?.userId || !parsed.hash || !parsed.salt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(record: LockRecord) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function clearLock() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasPinFor(userId: string): boolean {
  const record = readLock();
  return !!record && record.userId === userId;
}

/** Remaining lockout in ms (0 when unlocked). */
export function lockoutRemaining(record: LockRecord | null = readLock()): number {
  if (!record?.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - Date.now());
}

export async function setPin(userId: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("INVALID_PIN");
  const previous = readLock();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  writeLock({
    userId,
    salt: toB64(salt),
    hash,
    iterations: ITERATIONS,
    fails: 0,
    lockedUntil: null,
    credentialId: previous?.userId === userId ? previous.credentialId : null,
  });
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no-pin" }
  | { ok: false; reason: "locked"; waitMs: number }
  | { ok: false; reason: "wrong"; attemptsLeft: number; waitMs: number };

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const record = readLock();
  if (!record) return { ok: false, reason: "no-pin" };

  const waiting = lockoutRemaining(record);
  if (waiting > 0) return { ok: false, reason: "locked", waitMs: waiting };

  if (!isValidPin(pin)) {
    return { ok: false, reason: "wrong", attemptsLeft: Math.max(0, 3 - (record.fails + 1)), waitMs: 0 };
  }

  const hash = await derive(pin, fromB64(record.salt), record.iterations || ITERATIONS);
  if (hash === record.hash) {
    writeLock({ ...record, fails: 0, lockedUntil: null });
    return { ok: true };
  }

  const fails = record.fails + 1;
  const penaltyIndex = fails - 3;
  const waitMs = penaltyIndex >= 0 ? DELAYS[Math.min(penaltyIndex, DELAYS.length - 1)]! : 0;
  writeLock({ ...record, fails, lockedUntil: waitMs > 0 ? Date.now() + waitMs : null });
  return { ok: false, reason: "wrong", attemptsLeft: Math.max(0, 3 - fails), waitMs };
}

/* ---------- Biometrics (WebAuthn platform authenticator) ---------- */

export async function biometricsAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function biometricsEnabled(userId: string): boolean {
  const record = readLock();
  return !!record && record.userId === userId && !!record.credentialId;
}

export async function enableBiometrics(userId: string, displayName: string): Promise<boolean> {
  const record = readLock();
  if (!record || record.userId !== userId) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const id = new TextEncoder().encode(userId);
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge as unknown as BufferSource,
        rp: { name: "ZUKA PAY", id: window.location.hostname },
        user: { id: id as unknown as BufferSource, name: displayName || userId, displayName: displayName || "ZUKA PAY" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!credential) return false;
    writeLock({ ...readLock()!, credentialId: toB64(credential.rawId) });
    return true;
  } catch {
    return false;
  }
}

export function disableBiometrics() {
  const record = readLock();
  if (!record) return;
  writeLock({ ...record, credentialId: null });
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const record = readLock();
  if (!record?.credentialId) return false;
  if (lockoutRemaining(record) > 0) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge as unknown as BufferSource,
        allowCredentials: [
          { type: "public-key", id: fromB64(record.credentialId) as unknown as BufferSource },
        ],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    if (!assertion) return false;
    writeLock({ ...readLock()!, fails: 0, lockedUntil: null });
    return true;
  } catch {
    return false;
  }
}
