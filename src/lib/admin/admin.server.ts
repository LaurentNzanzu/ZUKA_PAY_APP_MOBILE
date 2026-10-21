import { supabaseAdmin } from "@/integrations/supabase/client.server";

export { supabaseAdmin };

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Throws unless the caller is an active admin holding `permission`. */
export async function requirePermission(userId: string, permission: string) {
  const { data, error } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _permission: permission,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("FORBIDDEN");
  return true;
}

export async function requireSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("FORBIDDEN");
  const { data: account } = await supabaseAdmin
    .from("admin_accounts")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account || account.status !== "active") throw new Error("FORBIDDEN");
  return true;
}

export interface AuditInput {
  actorId: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  result?: "success" | "failure";
}

export async function audit(input: AuditInput) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    old_value: (input.oldValue ?? null) as never,
    new_value: (input.newValue ?? null) as never,
    ip_address: input.ip ?? null,
    result: input.result ?? "success",
  });
}

export function clientIp(headers: Headers) {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
