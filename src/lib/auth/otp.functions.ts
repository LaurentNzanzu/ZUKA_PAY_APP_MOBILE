import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  generateSecureOTP,
  hashOtp,
  normalizePhone,
  checkAndRecordRateLimit,
  sendViaWhatsApp,
  sendViaSMS,
  findOrCreateAuthUser,
  OTP_CONFIG,
} from "./otp.server";

// ─── 1. Helper privé getClientIp ─────────────────────────────────────────────
function getClientIp(): string {
  try {
    const headers = getRequest().headers;
    const cfIp = headers.get("cf-connecting-ip");
    if (cfIp) return cfIp.trim();

    const xForwardedFor = headers.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }

    return "0.0.0.0";
  } catch {
    return "0.0.0.0";
  }
}

// ─── 2. Type exporté SendOtpResult ───────────────────────────────────────────
export type SendOtpResult =
  | { ok: true; channel: "whatsapp" | "sms" }
  | {
      ok: false;
      code:
        "INVALID_PHONE" | "COOLDOWN" | "PHONE_LIMIT" | "IP_LIMIT" | "GLOBAL_LIMIT" | "SEND_FAILED";
      retryAfter?: number;
    };

// ─── 3. Type exporté VerifyOtpResult ─────────────────────────────────────────
export type VerifyOtpResult =
  | { ok: true; tokenHash: string }
  | {
      ok: false;
      code:
        | "INVALID_PHONE"
        | "INVALID_CODE_FORMAT"
        | "INVALID_OR_EXPIRED"
        | "TOO_MANY_ATTEMPTS"
        | "SESSION_FAILED";
    };

// ─── 4. Server function sendOtp (Publique, sans middleware d'auth) ───────────
// Pas de middleware d'authentification car cet endpoint est appelé avant la connexion
export const sendOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: unknown }) => ({
    phone: String(d?.phone ?? ""),
  }))
  .handler(async ({ data }): Promise<SendOtpResult> => {
    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, code: "INVALID_PHONE" };

    const ip = getClientIp();

    try {
      await checkAndRecordRateLimit(phone, ip);

      const otp = generateSecureOTP();
      const hash = await hashOtp(otp, phone);
      const expiresAt = new Date(Date.now() + OTP_CONFIG.ttlMinutes() * 60_000);

      let result = await sendViaWhatsApp(phone, otp);
      let channel: "whatsapp" | "sms" = "whatsapp";

      if (!result.ok) {
        await (supabaseAdmin as any).from("system_events").insert({
          area: "otp",
          level: "warn",
          message: `WhatsApp failed: ${result.error}`,
          detail: { phone, ip },
        });

        // Fallback conditionnel : les erreurs non-retryables (401/403, template manquant)
        // signalent une anomalie de configuration bloquante ; on évite les surcoûts SMS
        if (!result.retryable) {
          await (supabaseAdmin as any).from("system_events").insert({
            area: "otp",
            level: "error",
            message: `Fatal WhatsApp error, SMS fallback skipped: ${result.error}`,
            detail: { phone, ip },
          });
          return { ok: false, code: "SEND_FAILED" };
        }

        result = await sendViaSMS(phone, otp);
        channel = "sms";
        if (!result.ok) {
          await (supabaseAdmin as any).from("system_events").insert({
            area: "otp",
            level: "error",
            message: `SMS fallback also failed: ${result.error}`,
            detail: { phone, ip },
          });
          return { ok: false, code: "SEND_FAILED" };
        }
      }

      await (supabaseAdmin as any).from("auth_otps").insert({
        phone,
        otp_hash: hash,
        max_attempts: OTP_CONFIG.maxAttempts(),
        channel,
        provider_message_id: result.messageId,
        expires_at: expiresAt.toISOString(),
      });

      await (supabaseAdmin as any).from("system_events").insert({
        area: "otp",
        level: "info",
        message: `OTP sent via ${channel}`,
        detail: { phone, channel },
      });

      return { ok: true, channel };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "UNKNOWN";

      if (msg.startsWith("OTP_COOLDOWN:")) {
        const retryAfter = Number(msg.split(":")[1]);
        return {
          ok: false,
          code: "COOLDOWN",
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : 60,
        };
      }

      if (msg === "OTP_PHONE_DAILY_LIMIT") return { ok: false, code: "PHONE_LIMIT" };
      if (msg === "OTP_IP_RATE_LIMIT") return { ok: false, code: "IP_LIMIT" };
      if (msg === "OTP_GLOBAL_LIMIT") return { ok: false, code: "GLOBAL_LIMIT" };

      if (msg.startsWith("MISSING_ENV_")) {
        await (supabaseAdmin as any).from("system_events").insert({
          area: "otp",
          level: "error",
          message: `Configuration error: ${msg}`,
          detail: { phone, ip },
        });
        return { ok: false, code: "SEND_FAILED" };
      }

      await (supabaseAdmin as any).from("system_events").insert({
        area: "otp",
        level: "error",
        message: `sendOtp unexpected error: ${msg}`,
        detail: { phone, ip },
      });
      return { ok: false, code: "SEND_FAILED" };
    }
  });

// ─── 5. Server function verifyOtp (Publique, sans middleware d'auth) ─────────
// Pas de middleware d'authentification car cet endpoint est le point d'entrée d'authentification
export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: unknown; code: unknown }) => ({
    phone: String(d?.phone ?? ""),
    code: String(d?.code ?? "").replace(/\D/g, ""),
  }))
  .handler(async ({ data }): Promise<VerifyOtpResult> => {
    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false, code: "INVALID_PHONE" };

    if (!/^\d{6}$/.test(data.code)) {
      return { ok: false, code: "INVALID_CODE_FORMAT" };
    }

    try {
      const hash = await hashOtp(data.code, phone);

      const { data: record } = await (supabaseAdmin as any)
        .from("auth_otps")
        .select("*")
        .eq("phone", phone)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Message neutre anti-énumération : ne pas distinguer un code inexistant d'un code erroné
      if (!record) {
        return { ok: false, code: "INVALID_OR_EXPIRED" };
      }

      const attempts = Number(record.attempts ?? 0);
      const maxAttempts = Number(record.max_attempts ?? 5);

      if (attempts >= maxAttempts) {
        await (supabaseAdmin as any)
          .from("auth_otps")
          .update({ is_used: true })
          .eq("id", record.id);
        return { ok: false, code: "TOO_MANY_ATTEMPTS" };
      }

      if (record.otp_hash !== hash) {
        await (supabaseAdmin as any).rpc("increment_otp_attempts", {
          _otp_id: record.id,
          _max_attempts: maxAttempts,
        });
        // Message neutre identique en cas de hash invalide
        return { ok: false, code: "INVALID_OR_EXPIRED" };
      }

      // Invalidation immédiate avant émission de la session pour empêcher toute réutilisation
      await (supabaseAdmin as any).from("auth_otps").update({ is_used: true }).eq("id", record.id);

      const { userId } = await findOrCreateAuthUser(phone);

      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!userData.user?.email) {
        await (supabaseAdmin as any).from("system_events").insert({
          area: "otp",
          level: "error",
          message: "USER_NO_EMAIL after findOrCreateAuthUser",
          detail: { phone, userId },
        });
        return { ok: false, code: "SESSION_FAILED" };
      }

      const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email,
      });
      if (linkErr || !link.properties?.hashed_token) {
        await (supabaseAdmin as any).from("system_events").insert({
          area: "otp",
          level: "error",
          message: `LINK_FAILED: ${linkErr?.message ?? "no hashed_token"}`,
          detail: { phone, userId },
        });
        return { ok: false, code: "SESSION_FAILED" };
      }

      await (supabaseAdmin as any).from("system_events").insert({
        area: "otp",
        level: "info",
        message: "OTP verified",
        detail: { phone },
      });

      return { ok: true, tokenHash: link.properties.hashed_token };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "UNKNOWN";
      await (supabaseAdmin as any).from("system_events").insert({
        area: "otp",
        level: "error",
        message: `verifyOtp unexpected error: ${msg}`,
        detail: { phone },
      });
      return { ok: false, code: "SESSION_FAILED" };
    }
  });
