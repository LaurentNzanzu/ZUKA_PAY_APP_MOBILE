export const TEST_ACCESS_ENABLED = 
  // Barrière 1 : Jamais en production, peu importe la variable d'env
  (typeof process !== "undefined" && process.env["NODE_ENV"] !== "production") &&
  // Barrière 2 : Nécessite l'activation explicite via variable d'environnement
  import.meta.env["VITE_TEST_ACCESS_ENABLED"] === "true";

export function isTestAccessHost(hostname: string): boolean {
  if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) return false;
  return hostname === "localhost" || hostname === "127.0.0.1" || /^id-preview--[0-9a-f-]+\.lovable\.app$/.test(hostname);
}
