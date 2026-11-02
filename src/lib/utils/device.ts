export function getOrCreateDeviceId(): string {
  // Garde-fou SSR
  if (typeof window === "undefined") return "";

  try {
    let id = localStorage.getItem("zuka.device.id");
    if (!id) {
      // Fallback si crypto.randomUUID n'est pas dispo (ex: http:// local)
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "dev-" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem("zuka.device.id", id);
    }
    return id;
  } catch {
    // Si le localStorage est bloqué (cookies désactivés, etc.)
    return "";
  }
}
