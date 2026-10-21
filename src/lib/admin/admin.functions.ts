import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminSession } from "./permissions";

const INVITE_TTL_DAYS = 7;

function emailOf(claims: unknown): string {
  const c = claims as { email?: string } | null;
  return c?.email ?? "";
}

/* ------------------------------------------------------------------ session */

export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSession> => {
    const { supabaseAdmin } = await import("./admin.server");
    const userId = context.userId;
    const email = emailOf(context.claims);

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, email, last_seen_at: new Date().toISOString() }, { onConflict: "id" });

    const [{ data: roles }, { data: perms }, { data: account }, { count: superCount }] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
        supabaseAdmin.from("admin_user_permissions").select("permission").eq("user_id", userId),
        supabaseAdmin.from("admin_accounts").select("status").eq("user_id", userId).maybeSingle(),
        supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "super_admin"),
      ]);

    const roleList = (roles ?? []).map((r) => r.role);
    const role: AdminSession["role"] = roleList.includes("super_admin")
      ? "super_admin"
      : roleList.includes("admin")
        ? "admin"
        : "user";
    const status = (account?.status as AdminSession["status"]) ?? "none";

    if (account?.status === "active") {
      await supabaseAdmin
        .from("admin_accounts")
        .update({ last_login_at: new Date().toISOString() })
        .eq("user_id", userId);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    return {
      userId,
      email,
      fullName: profile?.full_name ?? null,
      role,
      status,
      permissions: (perms ?? []).map((p) => p.permission),
      isSuperAdmin: role === "super_admin",
      isAdmin: role !== "user",
      needsBootstrap: (superCount ?? 0) === 0,
    };
  });

/** One-time claim: the very first signed-in email becomes the platform owner. */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, audit, clientIp } = await import("./admin.server");
    const email = emailOf(context.claims);
    if (!email) throw new Error("EMAIL_REQUIRED");

    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) > 0) throw new Error("ALREADY_BOOTSTRAPPED");

    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin", granted_by: context.userId });
    await supabaseAdmin
      .from("admin_accounts")
      .upsert({ user_id: context.userId, email, status: "active" }, { onConflict: "user_id" });
    await audit({
      actorId: context.userId,
      actorEmail: email,
      action: "admin.bootstrap_super_admin",
      entityType: "admin",
      entityId: context.userId,
      newValue: { role: "super_admin" },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------- admins */

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await import("./admin.server");
    await requirePermission(context.userId, "admins.view");

    const [{ data: accounts }, { data: roles }, { data: perms }, { data: profiles }, { data: invites }] =
      await Promise.all([
        supabaseAdmin.from("admin_accounts").select("*").order("created_at", { ascending: true }),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("admin_user_permissions").select("user_id, permission"),
        supabaseAdmin.from("profiles").select("id, full_name, email"),
        supabaseAdmin.from("admin_invitations").select("*").order("created_at", { ascending: false }),
      ]);

    const admins = (accounts ?? []).map((a) => {
      const rs = (roles ?? []).filter((r) => r.user_id === a.user_id).map((r) => r.role);
      const profile = (profiles ?? []).find((p) => p.id === a.user_id);
      return {
        userId: a.user_id,
        email: a.email,
        fullName: profile?.full_name ?? null,
        role: rs.includes("super_admin") ? "super_admin" : "admin",
        status: a.status,
        permissions: (perms ?? []).filter((p) => p.user_id === a.user_id).map((p) => p.permission),
        createdAt: a.created_at,
        lastLoginAt: a.last_login_at,
        invitedBy: a.invited_by,
      };
    });

    const invitations = (invites ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      permissions: i.permissions,
      status: i.expires_at < new Date().toISOString() && i.status === "pending" ? "expired" : i.status,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      invitedBy: i.invited_by,
    }));

    return { admins, invitations };
  });

export const inviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; role: "admin" | "super_admin"; permissions: string[]; origin: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp, randomToken, sha256Hex } =
      await import("./admin.server");
    await requirePermission(context.userId, "admins.manage");

    const email = data.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("INVALID_EMAIL");

    const { data: existing } = await supabaseAdmin
      .from("admin_accounts")
      .select("user_id, status")
      .ilike("email", email)
      .maybeSingle();
    if (existing && existing.status === "active") throw new Error("EMAIL_ALREADY_ADMIN");

    await supabaseAdmin
      .from("admin_invitations")
      .update({ status: "revoked" })
      .eq("status", "pending")
      .ilike("email", email);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString();
    const redirectTo = `${data.origin}/admin/invitation?token=${token}`;

    const { data: invitation, error } = await supabaseAdmin
      .from("admin_invitations")
      .insert({
        email,
        role: data.role,
        permissions: data.permissions,
        token_hash: await sha256Hex(token),
        expires_at: expiresAt,
        invited_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
    let emailSent = !invite.error;
    if (invite.error) {
      // user already exists in auth → send a magic link to the same destination
      const link = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      emailSent = !link.error;
    }

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "admin.invitation_sent",
      entityType: "admin_invitation",
      entityId: invitation.id,
      newValue: { email, role: data.role, permissions: data.permissions, expiresAt },
      ip: clientIp(getRequest().headers),
      result: emailSent ? "success" : "failure",
    });

    return { id: invitation.id, emailSent, acceptUrl: redirectTo };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "admins.manage");
    const { error } = await supabaseAdmin
      .from("admin_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "admin.invitation_revoked",
      entityType: "admin_invitation",
      entityId: data.id,
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, audit, clientIp, sha256Hex } = await import("./admin.server");
    const email = emailOf(context.claims).toLowerCase();
    if (!email) throw new Error("EMAIL_REQUIRED");

    const hash = await sha256Hex(data.token);
    const { data: invitation } = await supabaseAdmin
      .from("admin_invitations")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();

    if (!invitation || invitation.status !== "pending") throw new Error("INVITATION_INVALID");
    if (invitation.expires_at < new Date().toISOString()) {
      await supabaseAdmin.from("admin_invitations").update({ status: "expired" }).eq("id", invitation.id);
      throw new Error("INVITATION_EXPIRED");
    }
    if (invitation.email.toLowerCase() !== email) throw new Error("INVITATION_EMAIL_MISMATCH");

    await supabaseAdmin
      .from("admin_accounts")
      .upsert(
        { user_id: context.userId, email, status: "active", invited_by: invitation.invited_by },
        { onConflict: "user_id" },
      );
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: context.userId, role: invitation.role, granted_by: invitation.invited_by },
        { onConflict: "user_id,role" },
      );
    if (invitation.permissions.length) {
      await supabaseAdmin.from("admin_user_permissions").upsert(
        invitation.permissions.map((permission: string) => ({
          user_id: context.userId,
          permission,
          granted_by: invitation.invited_by,
        })),
        { onConflict: "user_id,permission" },
      );
    }
    await supabaseAdmin
      .from("admin_invitations")
      .update({ status: "accepted", accepted_by: context.userId, accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    await audit({
      actorId: context.userId,
      actorEmail: email,
      action: "admin.invitation_accepted",
      entityType: "admin_invitation",
      entityId: invitation.id,
      newValue: { role: invitation.role, permissions: invitation.permissions },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

export const setAdminPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; permissions: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "admins.manage");

    const { data: target } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if ((target ?? []).some((r) => r.role === "super_admin")) throw new Error("CANNOT_EDIT_SUPER_ADMIN");

    const { data: before } = await supabaseAdmin
      .from("admin_user_permissions")
      .select("permission")
      .eq("user_id", data.userId);

    await supabaseAdmin.from("admin_user_permissions").delete().eq("user_id", data.userId);
    if (data.permissions.length) {
      await supabaseAdmin.from("admin_user_permissions").insert(
        data.permissions.map((permission) => ({
          user_id: data.userId,
          permission,
          granted_by: context.userId,
        })),
      );
    }
    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "admin.permissions_updated",
      entityType: "admin",
      entityId: data.userId,
      oldValue: { permissions: (before ?? []).map((p) => p.permission) },
      newValue: { permissions: data.permissions },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

export const setAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; status: "active" | "suspended" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "admins.manage");
    if (data.userId === context.userId) throw new Error("CANNOT_SUSPEND_SELF");

    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if ((roles ?? []).some((r) => r.role === "super_admin")) throw new Error("CANNOT_SUSPEND_SUPER_ADMIN");

    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update({ status: data.status })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: data.status === "active" ? "admin.reactivated" : "admin.suspended",
      entityType: "admin",
      entityId: data.userId,
      newValue: { status: data.status },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "admins.manage");
    if (data.userId === context.userId) throw new Error("CANNOT_REVOKE_SELF");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if ((roles ?? []).some((r) => r.role === "super_admin")) throw new Error("CANNOT_REVOKE_SUPER_ADMIN");

    await supabaseAdmin.from("admin_user_permissions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    await supabaseAdmin.from("admin_accounts").delete().eq("user_id", data.userId);

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "admin.access_revoked",
      entityType: "admin",
      entityId: data.userId,
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; confirmEmail: string; keepAsAdmin: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireSuperAdmin, audit, clientIp } = await import("./admin.server");
    await requireSuperAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("CANNOT_TRANSFER_TO_SELF");

    const { data: target } = await supabaseAdmin
      .from("admin_accounts")
      .select("user_id, email, status")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("TARGET_NOT_ADMIN");
    if (target.status !== "active") throw new Error("TARGET_NOT_ACTIVE");
    if (target.email.toLowerCase() !== data.confirmEmail.trim().toLowerCase())
      throw new Error("CONFIRMATION_MISMATCH");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!authUser?.user?.email_confirmed_at) throw new Error("TARGET_EMAIL_NOT_VERIFIED");

    const { error } = await supabaseAdmin.rpc("transfer_ownership", {
      _from: context.userId,
      _to: data.userId,
      _keep_as_admin: data.keepAsAdmin,
    });
    if (error) throw new Error(error.message);

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "admin.ownership_transferred",
      entityType: "admin",
      entityId: data.userId,
      oldValue: { superAdmin: context.userId },
      newValue: { superAdmin: data.userId, previousKeptAsAdmin: data.keepAsAdmin },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

/* ----------------------------------------------------------------- pricing */

export const listPricingTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await import("./admin.server");
    await requirePermission(context.userId, "pricing.view");
    const { data } = await supabaseAdmin
      .from("group_pricing_tiers")
      .select("*")
      .order("min_members", { ascending: true });
    return data ?? [];
  });

export const savePricingTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      label: string;
      minMembers: number;
      maxMembers: number | null;
      price: number;
      currency: "USD" | "CDF";
      active: boolean;
      effectiveFrom: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "pricing.manage");

    const row = {
      label: data.label,
      min_members: data.minMembers,
      max_members: data.maxMembers,
      price: data.price,
      currency: data.currency,
      active: data.active,
      effective_from: data.effectiveFrom,
      updated_at: new Date().toISOString(),
    };

    let before: unknown = null;
    if (data.id) {
      const { data: prev } = await supabaseAdmin
        .from("group_pricing_tiers")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      before = prev;
      const { error } = await supabaseAdmin.from("group_pricing_tiers").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("group_pricing_tiers").insert(row);
      if (error) throw new Error(error.message);
    }

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: data.id ? "pricing.tier_updated" : "pricing.tier_created",
      entityType: "group_pricing_tier",
      entityId: data.id ?? null,
      oldValue: before,
      newValue: row,
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

/* ----------------------------------------------------- group subscriptions */

export const listSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await import("./admin.server");
    await requirePermission(context.userId, "payments.view");
    const { data } = await supabaseAdmin
      .from("group_subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

/* -------------------------------------------------------------- providers */

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await import("./admin.server");
    await requirePermission(context.userId, "mobile_money.view");
    const { data } = await supabaseAdmin
      .from("payment_providers")
      .select("id, name, slug, environment, enabled, priority, countries, currencies, api_base_url, public_key, secret_ref, secret_last4, status, last_error, last_tested_at")
      .order("priority", { ascending: true });
    return data ?? [];
  });

export const saveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      slug: string;
      environment: "sandbox" | "production";
      enabled: boolean;
      priority: number;
      countries: string[];
      currencies: string[];
      apiBaseUrl: string;
      publicKey: string;
      /** name of the server-side secret holding the API secret — never the secret itself */
      secretRef: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "mobile_money.manage");

    const secretValue = data.secretRef ? process.env[data.secretRef] : undefined;
    const row = {
      name: data.name,
      slug: data.slug,
      environment: data.environment,
      enabled: data.enabled,
      priority: data.priority,
      countries: data.countries,
      currencies: data.currencies,
      api_base_url: data.apiBaseUrl,
      public_key: data.publicKey,
      secret_ref: data.secretRef || null,
      secret_last4: secretValue ? secretValue.slice(-4) : null,
      status: secretValue ? "ok" : "unconfigured",
      updated_at: new Date().toISOString(),
    };

    let before: unknown = null;
    if (data.id) {
      const { data: prev } = await supabaseAdmin
        .from("payment_providers")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      before = prev;
      const { error } = await supabaseAdmin.from("payment_providers").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("payment_providers").insert(row);
      if (error) throw new Error(error.message);
    }

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: data.id ? "mobile_money.provider_updated" : "mobile_money.provider_added",
      entityType: "payment_provider",
      entityId: data.id ?? null,
      oldValue: before,
      newValue: { ...row, secret_last4: undefined },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

export const testProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "mobile_money.manage");

    const { data: provider } = await supabaseAdmin
      .from("payment_providers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!provider) throw new Error("PROVIDER_NOT_FOUND");

    let status: "ok" | "error" = "ok";
    let lastError: string | null = null;
    const secret = provider.secret_ref ? process.env[provider.secret_ref] : undefined;
    if (!secret) {
      status = "error";
      lastError = `Secret « ${provider.secret_ref ?? "—"} » introuvable côté serveur.`;
    } else if (!provider.api_base_url) {
      status = "error";
      lastError = "URL d'API manquante.";
    } else {
      const { getAdapter, SUPPORTED_SLUGS } = await import("@/lib/payments/adapters.server");
      const adapter = getAdapter(provider);
      if (!adapter) {
        status = "error";
        lastError = `Aucun connecteur pour « ${provider.slug} ». Identifiants pris en charge : ${SUPPORTED_SLUGS.join(", ")}.`;
      } else {
        try {
          // real credential handshake with the aggregator
          await adapter.verify();
        } catch (e) {
          status = "error";
          lastError = e instanceof Error ? e.message : "Connexion impossible";
        }
      }
    }

    await supabaseAdmin
      .from("payment_providers")
      .update({ status, last_error: lastError, last_tested_at: new Date().toISOString() })
      .eq("id", data.id);

    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "mobile_money.provider_tested",
      entityType: "payment_provider",
      entityId: data.id,
      newValue: { status, lastError },
      ip: clientIp(getRequest().headers),
      result: status === "ok" ? "success" : "failure",
    });

    return { status, lastError };
  });

/* ----------------------------------------------------------- transactions */

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await import("./admin.server");
    await requirePermission(context.userId, "transactions.view");
    const { data } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    await audit({
      actorId: context.userId,
      actorEmail: emailOf(context.claims),
      action: "transactions.viewed",
      entityType: "payment_transaction",
      ip: clientIp(getRequest().headers),
    });
    return data ?? [];
  });

/* ------------------------------------------------------------- audit logs */

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await import("./admin.server");
    await requirePermission(context.userId, "admins.view");
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    return data ?? [];
  });

/* ---------------------------------------------------------------- metrics */

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await import("./admin.server");
    await requirePermission(context.userId, "reports.view").catch(async () => {
      await requirePermission(context.userId, "admins.view");
    });

    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [users, newUsers, admins, subs, txs, providers] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin.from("admin_accounts").select("user_id", { count: "exact", head: true }),
      supabaseAdmin.from("group_subscriptions").select("status, price_locked, currency, member_count"),
      supabaseAdmin.from("payment_transactions").select("status, amount, currency, provider_id, created_at"),
      supabaseAdmin.from("payment_providers").select("id, name, enabled"),
    ]);

    const subRows = subs.data ?? [];
    const txRows = txs.data ?? [];
    const byStatus = (rows: { status: string }[]) =>
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});

    const revenue = subRows
      .filter((s) => s.status === "paid")
      .reduce<Record<string, number>>((acc, s) => {
        acc[s.currency] = (acc[s.currency] ?? 0) + Number(s.price_locked);
        return acc;
      }, {});

    const providerStats = (providers.data ?? []).map((p) => {
      const rows = txRows.filter((t) => t.provider_id === p.id);
      const success = rows.filter((t) => t.status === "SUCCESS").length;
      return {
        id: p.id,
        name: p.name,
        enabled: p.enabled,
        total: rows.length,
        success,
        failed: rows.filter((t) => ["FAILED", "EXPIRED", "CANCELLED"].includes(t.status)).length,
        successRate: rows.length ? Math.round((success / rows.length) * 100) : 0,
      };
    });

    const volumes = txRows
      .filter((t) => t.status === "SUCCESS")
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.currency] = (acc[t.currency] ?? 0) + Number(t.amount);
        return acc;
      }, {});

    return {
      users: { total: users.count ?? 0, new30d: newUsers.count ?? 0, admins: admins.count ?? 0 },
      groups: {
        total: new Set(subRows.map((s) => s.member_count)).size ? subRows.length : 0,
        subscriptions: subRows.length,
        paid: subRows.filter((s) => s.status === "paid").length,
        pending: subRows.filter((s) => s.status === "pending").length,
      },
      transactions: { total: txRows.length, byStatus: byStatus(txRows), volumes },
      revenue,
      providers: providerStats,
    };
  });
