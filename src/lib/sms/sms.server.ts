/** SMS provider adapters. Secrets are read from server env only. */

export interface SmsProviderRow {
  slug: string;
  environment: string;
  enabled: boolean;
  from_number: string | null;
  api_base_url: string | null;
  account_sid: string | null;
  secret_ref: string | null;
  countries: string[] | null;
}

export interface SmsResult {
  ok: boolean;
  providerReference?: string;
  error?: string;
}

function secret(ref: string | null | undefined) {
  if (!ref) return undefined;
  return process.env[ref];
}

async function sendTwilio(p: SmsProviderRow, to: string, body: string): Promise<SmsResult> {
  const token = secret(p.secret_ref);
  if (!p.account_sid || !token) return { ok: false, error: "IDENTIFIANTS_MANQUANTS" };
  if (!p.from_number) return { ok: false, error: "NUMERO_EMETTEUR_MANQUANT" };
  const base = p.api_base_url || "https://api.twilio.com";
  const res = await fetch(`${base}/2010-04-01/Accounts/${p.account_sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${p.account_sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: p.from_number, Body: body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) return { ok: false, error: json.message ?? `HTTP ${res.status}` };
  return { ok: true, ...(json.sid ? { providerReference: json.sid } : {}) };
}

export async function sendSms(p: SmsProviderRow, to: string, body: string): Promise<SmsResult> {
  if (!p.enabled) return { ok: false, error: "FOURNISSEUR_DESACTIVE" };
  switch (p.slug) {
    case "twilio":
      return sendTwilio(p, to, body);
    default:
      return { ok: false, error: "FOURNISSEUR_NON_SUPPORTE" };
  }
}

export function smsConfigured(p: SmsProviderRow | null | undefined) {
  return Boolean(p && p.enabled && p.account_sid && secret(p.secret_ref) && p.from_number);
}
