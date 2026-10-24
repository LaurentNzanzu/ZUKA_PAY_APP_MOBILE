import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─── 1. Helper privé requireEnv ──────────────────────────────────────────────
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`MISSING_ENV_${key}`);
  }
  return value;
}

// ─── 2. Configuration OTP ───────────────────────────────────────────────────
export const OTP_CONFIG = {
  pepper: (): string => requireEnv("OTP_PEPPER").trim(),
  ttlMinutes: (): number => Number(process.env["OTP_TTL_MINUTES"] ?? "5"),
  cooldownSeconds: (): number => Number(process.env["OTP_COOLDOWN_SECONDS"] ?? "60"),
  maxAttempts: (): number => Number(process.env["OTP_MAX_ATTEMPTS"] ?? "5"),
  maxPerPhonePerDay: (): number => Number(process.env["OTP_MAX_PER_PHONE_PER_DAY"] ?? "5"),
  maxPerIpPerHour: (): number => Number(process.env["OTP_MAX_PER_IP_PER_HOUR"] ?? "10"),
  maxGlobalPerHour: (): number => Number(process.env["OTP_MAX_GLOBAL_PER_HOUR"] ?? "1000"),
};

// ─── 3. Génération cryptographique de l'OTP ──────────────────────────────────
// Utilise le CSPRNG du système
export function generateSecureOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String((array[0]! % 900000) + 100000);
}

// ─── 4. Hachage sécurisé avec Pepper ─────────────────────────────────────────
// Le pepper secret empêche toute attaque par dictionnaire / rainbow table
export async function hashOtp(otp: string, phone: string): Promise<string> {
  const data = new TextEncoder().encode(`${otp}:${phone}:${OTP_CONFIG.pepper()}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ─── 5. Normalisation des numéros de téléphone (RDC +243) ───────────────────
export function normalizePhone(raw: string): string | null {
  // 1. strip des caractères non-digit et non-+
  let cleaned = raw.replace(/[^\d+]/g, "");

  // 2. Si commence par "00" → slice(2)
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }

  // 3. Si commence par "+" → slice(1)
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  // 4. Si commence par "243" → valide /^243\d{9}$/ (sinon null)
  if (cleaned.startsWith("243")) {
    return /^243\d{9}$/.test(cleaned) ? cleaned : null;
  }

  // 5. Si commence par "0" → préfixe "243" + slice(1)
  if (cleaned.startsWith("0")) {
    cleaned = `243${cleaned.slice(1)}`;
  }
  // 6. Sinon si length === 9 → préfixe "243"
  else if (cleaned.length === 9) {
    cleaned = `243${cleaned}`;
  }

  // 7. Validation finale : /^243\d{9}$/ → renvoie la string, sinon null
  return /^243\d{9}$/.test(cleaned) ? cleaned : null;
}

// ─── 6. Vérification & enregistrement des limites de débit ───────────────────
export async function checkAndRecordRateLimit(phone: string, ip: string): Promise<void> {
  const cooldownSeconds = OTP_CONFIG.cooldownSeconds();
  if (cooldownSeconds > 0) {
    const { data: latestOtp } = await (supabaseAdmin as any)
      .from("auth_otps")
      .select("created_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOtp?.created_at) {
      const elapsed = Date.now() - new Date(latestOtp.created_at).getTime();
      const cooldownMs = cooldownSeconds * 1000;
      if (elapsed < cooldownMs) {
        throw new Error(`OTP_COOLDOWN:${Math.ceil((cooldownMs - elapsed) / 1000)}`);
      }
    }
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: phoneCount } = await (supabaseAdmin as any)
    .from("auth_otp_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .eq("action", "send")
    .gte("created_at", oneDayAgo);

  if ((phoneCount ?? 0) >= OTP_CONFIG.maxPerPhonePerDay()) {
    throw new Error("OTP_PHONE_DAILY_LIMIT");
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: ipCount } = await (supabaseAdmin as any)
    .from("auth_otp_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("action", "send")
    .gte("created_at", oneHourAgo);

  if ((ipCount ?? 0) >= OTP_CONFIG.maxPerIpPerHour()) {
    throw new Error("OTP_IP_RATE_LIMIT");
  }

  const { count: globalCount } = await (supabaseAdmin as any)
    .from("auth_otp_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("action", "send")
    .gte("created_at", oneHourAgo);

  const hourCount = globalCount ?? 0;
  if (hourCount >= OTP_CONFIG.maxGlobalPerHour()) {
    await (supabaseAdmin as any).from("system_events").insert({
      area: "otp",
      level: "error",
      message: "Global OTP rate limit hit",
      detail: { ip, hourCount },
    });
    throw new Error("OTP_GLOBAL_LIMIT");
  }

  await (supabaseAdmin as any).from("auth_otp_rate_limits").insert({
    ip_address: ip,
    phone,
    action: "send",
  });
}

// ─── 7. Type SendResult ─────────────────────────────────────────────────────
export type SendResult =
  | { ok: true; channel: "whatsapp" | "sms"; messageId: string }
  | { ok: false; error: string; retryable: boolean };

// ─── 8. Envoi via Infobip WhatsApp Template ──────────────────────────────────
export async function sendViaWhatsApp(phone: string, otp: string): Promise<SendResult> {
  try {
    const baseUrl = requireEnv("INFOBIP_BASE_URL")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const apiKey = requireEnv("INFOBIP_API_KEY");
    const from = requireEnv("INFOBIP_SENDER").trim();
    const templateName = (process.env["INFOBIP_WA_TEMPLATE"] ?? "authentication").trim();
    const language = (process.env["INFOBIP_WA_LANG"] ?? "fr").trim();

    const res = await fetch(`https://${baseUrl}/whatsapp/1/message/template`, {
      method: "POST",
      headers: {
        Authorization: `App ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            from,
            to: phone,
            content: {
              templateName,
              templateData: {
                body: { placeholders: [otp] },
                buttons: [{ type: "URL", parameter: otp }],
              },
              language,
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const retryable = res.status !== 401 && res.status !== 403;
      return { ok: false, error: `WA_HTTP_${res.status}`, retryable };
    }

    const data = (await res.json()) as {
      messages?: Array<{
        messageId?: string;
        status?: {
          groupName?: string;
          name?: string;
          description?: string;
        };
        error?: {
          name?: string;
          description?: string;
        };
      }>;
    };

    const firstMessage = data.messages?.[0];
    const messageId = firstMessage?.messageId;
    const statusName = firstMessage?.status?.name ?? "UNKNOWN";
    const groupName = firstMessage?.status?.groupName ?? "UNKNOWN";
    const description = firstMessage?.status?.description ?? firstMessage?.error?.description ?? "";

    const successStates = ["PENDING", "DELIVERED", "SENT"];
    if (successStates.includes(statusName) || successStates.includes(groupName)) {
      return { ok: true, channel: "whatsapp", messageId: messageId ?? "unknown" };
    }

    const retryable = !["MISSING_TEMPLATE", "INVALID_TEMPLATE", "REJECTED_SOURCE"].includes(statusName);
    const errorMsg = description ? `WA_${statusName}: ${description}` : `WA_${statusName}`;
    return { ok: false, error: errorMsg, retryable };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, retryable: true };
  }
}

// ─── 9. Envoi via Infobip SMS de secours ─────────────────────────────────────
export async function sendViaSMS(phone: string, otp: string): Promise<SendResult> {
  try {
    const baseUrl = requireEnv("INFOBIP_BASE_URL")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const apiKey = requireEnv("INFOBIP_API_KEY");
    const from = process.env["INFOBIP_SMS_SENDER"] ?? "ZUKAPAY";

    const res = await fetch(`https://${baseUrl}/sms/2/text/advanced`, {
      method: "POST",
      headers: {
        Authorization: `App ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            from,
            destinations: [{ to: phone }],
            text: `Votre code de vérification ZUKA PAY est ${otp}. Valable ${OTP_CONFIG.ttlMinutes()} minutes. Ne le partagez avec personne.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const retryable = res.status !== 401 && res.status !== 403;
      return { ok: false, error: `SMS_HTTP_${res.status}`, retryable };
    }

    const data = (await res.json()) as {
      messages?: Array<{
        messageId?: string;
        status?: {
          groupName?: string;
        };
      }>;
    };

    const firstMessage = data.messages?.[0];
    const messageId = firstMessage?.messageId;
    const groupName = firstMessage?.status?.groupName ?? "UNKNOWN";

    if (groupName === "PENDING") {
      return { ok: true, channel: "sms", messageId: messageId ?? "unknown" };
    }

    return { ok: false, error: `SMS_${groupName}`, retryable: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, retryable: true };
  }
}

// ─── 10. Lookup ou création atomique du compte Auth ─────────────────────────
export async function findOrCreateAuthUser(phone: string): Promise<{ userId: string }> {
  const { data: existingUserPhone } = await (supabaseAdmin as any)
    .from("user_phones")
    .select("user_id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (existingUserPhone?.user_id) {
    return { userId: existingUserPhone.user_id };
  }

  const virtualEmail = `${phone}@otp.zukapay.cash`;
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    phone: `+${phone}`,
    email: virtualEmail,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { phone: `+${phone}` },
  });

  if (error) {
    const { data: retryUserPhone } = await (supabaseAdmin as any)
      .from("user_phones")
      .select("user_id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (retryUserPhone?.user_id) {
      return { userId: retryUserPhone.user_id };
    }

    throw new Error(`USER_CREATE_FAILED: ${error.message}`);
  }

  if (!created || !created.user) {
    throw new Error("USER_CREATE_NULL");
  }

  return { userId: created.user.id };
}
