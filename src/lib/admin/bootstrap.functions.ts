import { createServerFn } from "@tanstack/react-start";

/** Public: tells the admin login page whether the platform still has no owner. */
export const platformNeedsBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("./admin.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");
  return { needsBootstrap: (count ?? 0) === 0 };
});
