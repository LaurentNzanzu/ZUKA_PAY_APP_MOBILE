import { defineNitroPlugin } from "nitropack/runtime";

/**
 * Nitro plugin : démarre un setInterval de secours pour déclencher le cron
 * régulièrement, MAIS uniquement si :
 *   1. CRON_INTERVAL_ENABLED === "true" (contrôle explicite)
 *   2. Le runtime est always-on (pas serverless — sinon setInterval ne persiste pas)
 */
export default defineNitroPlugin(() => {
  if (process.env["CRON_INTERVAL_ENABLED"] !== "true") {
    console.log("[cron] interval disabled (CRON_INTERVAL_ENABLED != 'true')");
    return;
  }

  const preset = process.env["NITRO_PRESET"] ?? "";
  const isServerless =
    preset.includes("cloudflare") ||
    preset.includes("vercel") ||
    preset.includes("netlify") ||
    preset.includes("lambda") ||
    process.env["CF_PAGES"] === "1" ||
    process.env["VERCEL"] === "1" ||
    process.env["AWS_LAMBDA_FUNCTION_NAME"] !== undefined;

  if (isServerless) {
    console.log(`[cron] interval skipped on serverless runtime (preset=${preset}), request-trigger active`);
    return;
  }

  const minutes = Number(process.env["CRON_INTERVAL_MINUTES"] ?? "15");
  const intervalMs = Math.max(1, Math.min(minutes, 60)) * 60_000;

  console.log(`[cron] interval enabled, every ${minutes} min`);

  // Petit délai au boot pour laisser l'app se stabiliser
  setTimeout(() => {
    import("@/lib/cron/maybe-run.server")
      .then((m) => m.maybeRunCron("boot"))
      .catch((err) => console.error("[cron] boot catch-up failed:", err));
  }, 5_000);

  setInterval(() => {
    import("@/lib/cron/maybe-run.server")
      .then((m) => m.maybeRunCron("interval"))
      .catch((err) => console.error("[cron] interval tick failed:", err));
  }, intervalMs);
});
