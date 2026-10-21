/**
 * Real Mobile Money aggregator adapters (server-only).
 *
 * Architecture: Payment Provider (row in `payment_providers`) -> Provider Adapter -> ZUKA PAY Payment Engine.
 * No secret is ever stored in the database: the row only keeps `secret_ref`
 * (the NAME of a server secret) and the last 4 characters for verification.
 *
 * Per-provider secrets, derived from `secret_ref` (e.g. AIRTEL_MONEY_SECRET):
 *   <REF>                    -> API secret / client secret / consumer secret
 *   <REF>_CLIENT_ID          -> optional, overrides provider.public_key
 *   <REF>_SUBSCRIPTION_KEY   -> MTN MoMo Ocp-Apim-Subscription-Key
 *   <REF>_API_USER           -> MTN MoMo API user (UUID)
 *   <REF>_MERCHANT           -> Orange / M-Pesa merchant (service provider) code
 *
 * Every adapter only ever INITIATES a collection and READS a status.
 * A payment is only ever marked SUCCESS by the provider (webhook or status read).
 */

export type NormalizedStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface ProviderRow {
  id: string;
  slug: string;
  environment: string;
  api_base_url: string | null;
  public_key: string | null;
  secret_ref: string | null;
}

export interface CollectRequest {
  reference: string;
  amount: number;
  currency: string;
  /** subscriber phone number, international format without "+" */
  msisdn: string;
  description: string;
  callbackUrl: string;
}

export interface CollectResult {
  status: NormalizedStatus;
  providerReference: string | null;
  raw: unknown;
}

export interface PaymentAdapter {
  /** Lightweight credential check used by the "Tester" button in /admin/providers. */
  verify(): Promise<void>;
  collect(req: CollectRequest): Promise<CollectResult>;
  status(reference: string, providerReference: string | null): Promise<NormalizedStatus>;
}

class ProviderError extends Error {}

function env(name: string): string | undefined {
  return process.env[name];
}

function required(value: string | undefined | null, label: string): string {
  if (!value) throw new ProviderError(`Configuration manquante : ${label}`);
  return value;
}

async function readError(res: Response) {
  const body = await res.text();
  return `HTTP ${res.status} — ${body.slice(0, 400)}`;
}

function normalize(value: string | undefined | null): NormalizedStatus {
  const v = (value ?? "").toUpperCase();
  if (["SUCCESS", "SUCCESSFUL", "SUCCEEDED", "COMPLETED", "TS", "0", "PAID"].includes(v)) return "SUCCESS";
  if (["FAILED", "FAILURE", "TF", "ERROR", "REJECTED"].includes(v)) return "FAILED";
  if (["CANCELLED", "CANCELED", "ABORTED"].includes(v)) return "CANCELLED";
  if (["EXPIRED", "TIMEDOUT", "TIMEOUT"].includes(v)) return "EXPIRED";
  if (["PROCESSING", "ONGOING", "IN_PROGRESS", "INITIATED"].includes(v)) return "PROCESSING";
  return "PENDING";
}

/* ------------------------------------------------------------- Airtel Money */
/** Airtel Africa Developer API — Collections (USSD push). */
function airtelAdapter(p: ProviderRow): PaymentAdapter {
  const base = required(p.api_base_url, "URL de l'API Airtel").replace(/\/$/, "");
  const ref = required(p.secret_ref, "nom du secret Airtel");
  const clientId = required(env(`${ref}_CLIENT_ID`) ?? p.public_key, "client_id Airtel");
  const clientSecret = required(env(ref), `secret « ${ref} »`);
  const country = "CD";

  const token = async () => {
    const res = await fetch(`${base}/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    });
    if (!res.ok) throw new ProviderError(await readError(res));
    const json = (await res.json()) as { access_token?: string };
    return required(json.access_token, "jeton Airtel");
  };

  const headers = async (currency: string) => ({
    Authorization: `Bearer ${await token()}`,
    "Content-Type": "application/json",
    Accept: "*/*",
    "X-Country": country,
    "X-Currency": currency,
  });

  return {
    async verify() {
      await token();
    },
    async collect(req) {
      const res = await fetch(`${base}/merchant/v1/payments/`, {
        method: "POST",
        headers: await headers(req.currency),
        body: JSON.stringify({
          reference: req.description,
          subscriber: { country, currency: req.currency, msisdn: req.msisdn.slice(-9) },
          transaction: { amount: req.amount, country, currency: req.currency, id: req.reference },
        }),
      });
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { data?: { transaction?: { id?: string; status?: string } } };
      return {
        status: normalize(json.data?.transaction?.status) === "SUCCESS" ? "PROCESSING" : normalize(json.data?.transaction?.status),
        providerReference: json.data?.transaction?.id ?? null,
        raw: json,
      };
    },
    async status(reference) {
      const res = await fetch(`${base}/standard/v1/payments/${encodeURIComponent(reference)}`, {
        method: "GET",
        headers: await headers("CDF"),
      });
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { data?: { transaction?: { status?: string } } };
      return normalize(json.data?.transaction?.status);
    },
  };
}

/* ----------------------------------------------------------------- MTN MoMo */
/** MTN MoMo API — Collection (RequestToPay). */
function mtnAdapter(p: ProviderRow): PaymentAdapter {
  const base = required(p.api_base_url, "URL de l'API MTN MoMo").replace(/\/$/, "");
  const ref = required(p.secret_ref, "nom du secret MTN");
  const apiUser = required(env(`${ref}_API_USER`) ?? p.public_key, "API user MTN");
  const apiKey = required(env(ref), `secret « ${ref} »`);
  const subKey = required(env(`${ref}_SUBSCRIPTION_KEY`), `${ref}_SUBSCRIPTION_KEY`);
  const target = p.environment === "production" ? "mtncongo" : "sandbox";

  const token = async () => {
    const res = await fetch(`${base}/collection/token/`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${apiUser}:${apiKey}`)}`,
        "Ocp-Apim-Subscription-Key": subKey,
      },
    });
    if (!res.ok) throw new ProviderError(await readError(res));
    const json = (await res.json()) as { access_token?: string };
    return required(json.access_token, "jeton MTN");
  };

  return {
    async verify() {
      await token();
    },
    async collect(req) {
      const res = await fetch(`${base}/collection/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await token()}`,
          "X-Reference-Id": crypto.randomUUID(),
          "X-Target-Environment": target,
          "X-Callback-Url": req.callbackUrl,
          "Ocp-Apim-Subscription-Key": subKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: String(req.amount),
          currency: req.currency,
          externalId: req.reference,
          payer: { partyIdType: "MSISDN", partyId: req.msisdn },
          payerMessage: req.description,
          payeeNote: req.description,
        }),
      });
      if (!res.ok && res.status !== 202) throw new ProviderError(await readError(res));
      return { status: "PROCESSING", providerReference: res.headers.get("x-reference-id"), raw: null };
    },
    async status(reference, providerReference) {
      const id = providerReference ?? reference;
      const res = await fetch(`${base}/collection/v1_0/requesttopay/${encodeURIComponent(id)}`, {
        headers: {
          Authorization: `Bearer ${await token()}`,
          "X-Target-Environment": target,
          "Ocp-Apim-Subscription-Key": subKey,
        },
      });
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { status?: string };
      return normalize(json.status);
    },
  };
}

/* ------------------------------------------------------------ Orange Money */
/** Orange Money Web Payment (OAuth2 + /webpayment). */
function orangeAdapter(p: ProviderRow): PaymentAdapter {
  const base = required(p.api_base_url, "URL de l'API Orange Money").replace(/\/$/, "");
  const ref = required(p.secret_ref, "nom du secret Orange");
  const authHeader = required(env(ref), `secret « ${ref} »`); // Basic <base64(client_id:client_secret)>
  const merchant = env(`${ref}_MERCHANT`) ?? p.public_key ?? "";

  const token = async () => {
    const res = await fetch(`${base}/oauth/v3/token`, {
      method: "POST",
      headers: {
        Authorization: authHeader.startsWith("Basic ") ? authHeader : `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new ProviderError(await readError(res));
    const json = (await res.json()) as { access_token?: string };
    return required(json.access_token, "jeton Orange");
  };

  return {
    async verify() {
      await token();
    },
    async collect(req) {
      const res = await fetch(`${base}/orange-money-webpay/cd/v1/webpayment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_key: merchant,
          currency: req.currency,
          order_id: req.reference,
          amount: req.amount,
          return_url: req.callbackUrl,
          cancel_url: req.callbackUrl,
          notif_url: req.callbackUrl,
          lang: "fr",
          reference: req.description,
        }),
      });
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { pay_token?: string; status?: string };
      return { status: "PROCESSING", providerReference: json.pay_token ?? null, raw: json };
    },
    async status(reference, providerReference) {
      const res = await fetch(`${base}/orange-money-webpay/cd/v1/transactionstatus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: reference, amount: 0, pay_token: providerReference }),
      });
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { status?: string };
      return normalize(json.status);
    },
  };
}

/* ---------------------------------------------------------------- M-Pesa RDC */
/** Vodacom M-Pesa OpenAPI — C2B single stage. */
function mpesaAdapter(p: ProviderRow): PaymentAdapter {
  const base = required(p.api_base_url, "URL de l'API M-Pesa").replace(/\/$/, "");
  const ref = required(p.secret_ref, "nom du secret M-Pesa");
  const bearer = required(env(ref), `secret « ${ref} »`); // session/API key
  const serviceCode = required(env(`${ref}_MERCHANT`) ?? p.public_key, "code service M-Pesa");

  const headers = {
    Authorization: `Bearer ${bearer}`,
    Origin: "*",
    "Content-Type": "application/json",
  };

  return {
    async verify() {
      const res = await fetch(`${base}/getSession/`, { headers });
      if (!res.ok) throw new ProviderError(await readError(res));
    },
    async collect(req) {
      const res = await fetch(`${base}/c2bPayment/singleStage/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          input_Amount: String(req.amount),
          input_Currency: req.currency,
          input_CustomerMSISDN: req.msisdn,
          input_ServiceProviderCode: serviceCode,
          input_ThirdPartyConversationID: req.reference,
          input_TransactionReference: req.reference,
          input_PurchasedItemsDesc: req.description,
        }),
      });
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { output_ConversationID?: string; output_ResponseCode?: string };
      return {
        status: json.output_ResponseCode === "INS-0" ? "PROCESSING" : "PENDING",
        providerReference: json.output_ConversationID ?? null,
        raw: json,
      };
    },
    async status(reference, providerReference) {
      const res = await fetch(
        `${base}/queryTransactionStatus/?input_QueryReference=${encodeURIComponent(
          providerReference ?? reference,
        )}&input_ServiceProviderCode=${encodeURIComponent(serviceCode)}&input_ThirdPartyConversationID=${encodeURIComponent(reference)}`,
        { headers },
      );
      if (!res.ok) throw new ProviderError(await readError(res));
      const json = (await res.json()) as { output_ResponseTransactionStatus?: string };
      return normalize(json.output_ResponseTransactionStatus);
    },
  };
}

const BUILDERS: Record<string, (p: ProviderRow) => PaymentAdapter> = {
  airtel: airtelAdapter,
  "airtel-money": airtelAdapter,
  mtn: mtnAdapter,
  "mtn-momo": mtnAdapter,
  orange: orangeAdapter,
  "orange-money": orangeAdapter,
  mpesa: mpesaAdapter,
  "m-pesa": mpesaAdapter,
};

export function getAdapter(provider: ProviderRow): PaymentAdapter | null {
  const build = BUILDERS[provider.slug.toLowerCase()];
  return build ? build(provider) : null;
}

export const SUPPORTED_SLUGS = ["airtel-money", "mtn-momo", "orange-money", "m-pesa"] as const;
