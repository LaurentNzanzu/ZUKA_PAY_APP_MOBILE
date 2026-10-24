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

// Pure JS SHA-256 and PBKDF2 fallback for environments where crypto.subtle is undefined (e.g. HTTP non-localhost)
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Block(H: Uint32Array, W: Uint32Array) {
  let a = H[0]!, b = H[1]!, c = H[2]!, d = H[3]!, e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!;
  for (let i = 0; i < 64; i++) {
    if (i >= 16) {
      const s0 = rotr(W[i - 15]!, 7) ^ rotr(W[i - 15]!, 18) ^ (W[i - 15]! >>> 3);
      const s1 = rotr(W[i - 2]!, 17) ^ rotr(W[i - 2]!, 19) ^ (W[i - 2]! >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0;
    }
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + K256[i]! + W[i]!) | 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) | 0;

    h = g; g = f; f = e; e = (d + temp1) | 0;
    d = c; c = b; b = a; a = (temp1 + temp2) | 0;
  }
  H[0] = (H[0]! + a) | 0;
  H[1] = (H[1]! + b) | 0;
  H[2] = (H[2]! + c) | 0;
  H[3] = (H[3]! + d) | 0;
  H[4] = (H[4]! + e) | 0;
  H[5] = (H[5]! + f) | 0;
  H[6] = (H[6]! + g) | 0;
  H[7] = (H[7]! + h) | 0;
}

function sha256(msgBytes: Uint8Array): Uint8Array {
  const len = msgBytes.length;
  const bitLen = len * 8;
  const padLen = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msgBytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(offset + (i << 2));
    }
    sha256Block(H, W);
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i << 2, H[i]!);
  return out;
}

function hmacSha256(keyBytes: Uint8Array, msgBytes: Uint8Array): Uint8Array {
  let k = keyBytes;
  if (k.length > 64) k = sha256(k);
  const kPadI = new Uint8Array(64);
  const kPadO = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const b = i < k.length ? k[i]! : 0;
    kPadI[i] = b ^ 0x36;
    kPadO[i] = b ^ 0x5c;
  }
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(kPadI);
  inner.set(msgBytes, 64);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(64 + 32);
  outer.set(kPadO);
  outer.set(innerHash, 64);
  return sha256(outer);
}

function pbkdf2HmacSha256(passwordStr: string, saltBytes: Uint8Array, iterations: number, keyLenBytes = 32): Uint8Array {
  const pwBytes = new TextEncoder().encode(passwordStr);
  const numBlocks = Math.ceil(keyLenBytes / 32);
  const result = new Uint8Array(numBlocks * 32);

  for (let block = 1; block <= numBlocks; block++) {
    const saltAndIndex = new Uint8Array(saltBytes.length + 4);
    saltAndIndex.set(saltBytes);
    new DataView(saltAndIndex.buffer).setUint32(saltBytes.length, block);

    let u = hmacSha256(pwBytes, saltAndIndex);
    const blockXor = new Uint8Array(u);

    for (let iter = 1; iter < iterations; iter++) {
      u = hmacSha256(pwBytes, u);
      for (let j = 0; j < 32; j++) blockXor[j]! ^= u[j]!;
    }
    result.set(blockXor, (block - 1) * 32);
  }
  return result.slice(0, keyLenBytes);
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const subtle = typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;
  if (subtle) {
    try {
      const key = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
      const bits = await subtle.deriveBits(
        { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
        key,
        256,
      );
      return toB64(bits);
    } catch {
      // Fall through to pure JS implementation
    }
  }

  // Fallback pure JS pour contextes non sécurisés (HTTP IP locale, etc.)
  const iters = Math.min(iterations, 5_000);
  const bits = pbkdf2HmacSha256(pin, salt, iters, 32);
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
  const salt = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
  } else {
    for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
  }

  const hasSubtle = typeof crypto !== "undefined" && Boolean(crypto.subtle);
  const iterations = hasSubtle ? ITERATIONS : 5_000;
  const hash = await derive(pin, salt, iterations);

  writeLock({
    userId,
    salt: toB64(salt),
    hash,
    iterations,
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

  const defaultIters = typeof crypto !== "undefined" && crypto.subtle ? ITERATIONS : 5_000;
  const hash = await derive(pin, fromB64(record.salt), record.iterations || defaultIters);
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
