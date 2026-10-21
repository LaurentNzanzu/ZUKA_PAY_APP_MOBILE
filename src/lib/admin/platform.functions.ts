import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function srv() {
  return await import("./admin.server");
}

/* ------------------------------------------------------------------ users */

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "users.view");

    const [{ data: profiles }, { data: memberships }, { data: roles }, { data: admins }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, phone, created_at, last_seen_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin.from("tontine_members").select("user_id, tontine_id, name, status"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("admin_accounts").select("user_id, status"),
      ]);

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      phone: p.phone,
      createdAt: p.created_at,
      lastSeenAt: p.last_seen_at,
      groups: (memberships ?? []).filter((m) => m.user_id === p.id).length,
      role: (roles ?? []).find((r) => r.user_id === p.id)?.role ?? "user",
      adminStatus: (admins ?? []).find((a) => a.user_id === p.id)?.status ?? null,
      suspended: (memberships ?? []).some((m) => m.user_id === p.id && m.status === "suspended"),
    }));
  });

export const getPlatformUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "users.view");
    const [{ data: profile }, { data: memberships }, { data: activity }, { data: txs }, { data: events }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
        supabaseAdmin
          .from("tontine_members")
          .select("id, tontine_id, name, role, status, position, tontines(name, currency)")
          .eq("user_id", data.userId),
        supabaseAdmin
          .from("group_activity")
          .select("id, message, created_at, tontine_id")
          .eq("actor_id", data.userId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabaseAdmin
          .from("payment_transactions")
          .select("reference, amount, currency, status, created_at")
          .eq("member_id", data.userId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabaseAdmin
          .from("audit_logs")
          .select("action, created_at, result")
          .eq("entity_id", data.userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
    return {
      profile,
      memberships: memberships ?? [],
      activity: activity ?? [],
      transactions: txs ?? [],
      securityEvents: events ?? [],
    };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; suspended: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await srv();
    await requirePermission(context.userId, "users.suspend");
    const { error } = await supabaseAdmin
      .from("tontine_members")
      .update({ status: data.suspended ? "suspended" : "active" })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await audit({
      actorId: context.userId,
      action: data.suspended ? "user.suspend" : "user.reactivate",
      entityType: "user",
      entityId: data.userId,
      newValue: { suspended: data.suspended },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

/* --------------------------------------------------------------- tontines */

export const listPlatformTontines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "groups.view");

    const [{ data: tontines }, { data: members }, { data: contributions }, { data: periods }, { data: profiles }] =
      await Promise.all([
        supabaseAdmin.from("tontines").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("tontine_members").select("id, tontine_id, name, role, status, position, user_id"),
        supabaseAdmin.from("contributions").select("tontine_id, amount_due, amount_paid, status"),
        supabaseAdmin.from("contribution_periods").select("tontine_id, idx, due_date, status"),
        supabaseAdmin.from("profiles").select("id, full_name, email, phone"),
      ]);

    const today = new Date().toISOString().slice(0, 10);
    return (tontines ?? []).map((t) => {
      const ms = (members ?? []).filter((m) => m.tontine_id === t.id && m.status === "active");
      const cs = (contributions ?? []).filter((c) => c.tontine_id === t.id);
      const ps = (periods ?? []).filter((p) => p.tontine_id === t.id);
      const owner = (profiles ?? []).find((p) => p.id === t.created_by);
      const expected = cs.reduce((s, c) => s + Number(c.amount_due), 0);
      const collected = cs.reduce((s, c) => s + Number(c.amount_paid), 0);
      const late = cs.filter((c) => c.status === "late").length;
      const next = ps.filter((p) => p.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      return {
        id: t.id,
        name: t.name,
        currency: t.currency,
        amount: Number(t.amount),
        frequency: t.frequency,
        status: t.status,
        startDate: t.start_date,
        totalDues: t.total_dues,
        createdAt: t.created_at,
        owner: owner?.full_name ?? owner?.email ?? owner?.phone ?? "—",
        ownerId: t.created_by,
        memberCount: ms.length,
        order: ms.sort((a, b) => a.position - b.position).map((m) => m.name),
        expected,
        collected,
        late,
        nextDue: next?.due_date ?? null,
      };
    });
  });

export const setTontineStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tontineId: string; status: "active" | "suspended" | "closed" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await srv();
    await requirePermission(context.userId, "groups.suspend");
    const { data: before } = await supabaseAdmin
      .from("tontines")
      .select("status")
      .eq("id", data.tontineId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("tontines")
      .update({ status: data.status })
      .eq("id", data.tontineId);
    if (error) throw new Error(error.message);
    await audit({
      actorId: context.userId,
      action: "group.status",
      entityType: "tontine",
      entityId: data.tontineId,
      oldValue: before,
      newValue: { status: data.status },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

/* --------------------------------------------------------------- settings */

export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "settings.view");
    const { data } = await supabaseAdmin.from("app_settings").select("*").order("key");
    return data ?? [];
  });

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await srv();
    await requirePermission(context.userId, "settings.manage");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.value);
    } catch {
      throw new Error("VALEUR_JSON_INVALIDE");
    }
    const { data: before } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", data.key)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        {
          key: data.key,
          value: parsed as never,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    await audit({
      actorId: context.userId,
      action: "settings.update",
      entityType: "setting",
      entityId: data.key,
      oldValue: before?.value ?? null,
      newValue: parsed,
      ip: clientIp(getRequest().headers),
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------- SMS */

export const listSmsProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "settings.view");
    const { data } = await supabaseAdmin
      .from("sms_providers")
      .select(
        "id, name, slug, environment, enabled, from_number, countries, api_base_url, account_sid, secret_last4, status, last_error, last_tested_at",
      )
      .order("name");
    return data ?? [];
  });

export const saveSmsProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      environment: "sandbox" | "production";
      enabled: boolean;
      fromNumber: string;
      apiBaseUrl: string;
      accountSid: string;
      countries: string[];
      secretRef?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await srv();
    await requirePermission(context.userId, "settings.manage");

    const secretRef = data.secretRef?.trim() || null;
    const secretValue = secretRef ? process.env[secretRef] : undefined;
    const patch: {
      environment: string;
      enabled: boolean;
      from_number: string | null;
      api_base_url: string | null;
      account_sid: string | null;
      countries: string[];
      updated_at: string;
      secret_ref?: string;
      secret_last4?: string | null;
      status?: string;
    } = {
      environment: data.environment,
      enabled: data.enabled,
      from_number: data.fromNumber || null,
      api_base_url: data.apiBaseUrl || null,
      account_sid: data.accountSid || null,
      countries: data.countries.length ? data.countries : ["CD"],
      updated_at: new Date().toISOString(),
    };
    if (secretRef) {
      patch.secret_ref = secretRef;
      patch.secret_last4 = secretValue ? secretValue.slice(-4) : null;
    }
    patch.status =
      data.accountSid && data.fromNumber && secretValue ? "configured" : "unconfigured";

    const { data: before } = await supabaseAdmin
      .from("sms_providers")
      .select("environment, enabled, from_number, account_sid, status")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("sms_providers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({
      actorId: context.userId,
      action: "sms.configure",
      entityType: "sms_provider",
      entityId: data.id,
      oldValue: before,
      newValue: { ...patch, secret_ref: secretRef },
      ip: clientIp(getRequest().headers),
    });
    return { ok: true, secretPresent: Boolean(secretValue) };
  });

export const testSmsProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; to: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requirePermission, audit, clientIp } = await srv();
    await requirePermission(context.userId, "settings.manage");
    const { data: provider } = await supabaseAdmin
      .from("sms_providers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!provider) throw new Error("FOURNISSEUR_INTROUVABLE");
    const { sendSms } = await import("@/lib/sms/sms.server");
    const res = await sendSms(provider, data.to, "ZUKA PAY : test de configuration SMS.");
    await supabaseAdmin
      .from("sms_providers")
      .update({
        last_tested_at: new Date().toISOString(),
        last_error: res.ok ? null : (res.error ?? "Erreur inconnue"),
        status: res.ok ? "healthy" : "error",
      })
      .eq("id", data.id);
    await supabaseAdmin.from("system_events").insert({
      area: "sms",
      level: res.ok ? "info" : "error",
      message: res.ok ? "Test SMS envoyé" : `Test SMS échoué : ${res.error}`,
    });
    await audit({
      actorId: context.userId,
      action: "sms.test",
      entityType: "sms_provider",
      entityId: data.id,
      newValue: { ok: res.ok, error: res.error ?? null },
      result: res.ok ? "success" : "failure",
      ip: clientIp(getRequest().headers),
    });
    return res;
  });

/* --------------------------------------------------- notifications & invites */

export const listPlatformNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "settings.view");
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, kind, title, body, channel, status, error, created_at, sent_at, read_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

/* ---------------------------------------------------------- system health */

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, requirePermission } = await srv();
    await requirePermission(context.userId, "settings.view");

    type Level = "ok" | "warn" | "error";
    const services: { key: string; label: string; level: Level; detail: string }[] = [];

    const t0 = Date.now();
    const { error: dbError } = await supabaseAdmin
      .from("app_settings")
      .select("key", { head: true, count: "exact" });
    services.push({
      key: "database",
      label: "Base de données",
      level: dbError ? "error" : "ok",
      detail: dbError ? dbError.message : `Réponse en ${Date.now() - t0} ms`,
    });

    const { count: userCount } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    services.push({
      key: "auth",
      label: "Authentification",
      level: "ok",
      detail: `${userCount ?? 0} compte(s) enregistré(s)`,
    });

    const { data: providers } = await supabaseAdmin
      .from("payment_providers")
      .select("name, enabled, status, last_error");
    const activeProviders = (providers ?? []).filter((p) => p.enabled);
    services.push({
      key: "payments",
      label: "Fournisseur Mobile Money",
      level: activeProviders.length
        ? activeProviders.some((p) => p.status === "error")
          ? "warn"
          : "ok"
        : "error",
      detail: activeProviders.length
        ? `${activeProviders.length} fournisseur(s) actif(s)`
        : "Aucun fournisseur activé : les paiements sont refusés",
    });

    const { data: sms } = await supabaseAdmin
      .from("sms_providers")
      .select("name, enabled, status, secret_last4, from_number, last_error");
    const activeSms = (sms ?? []).find((s) => s.enabled);
    services.push({
      key: "sms",
      label: "Fournisseur SMS",
      level: activeSms ? (activeSms.status === "error" ? "error" : "ok") : "warn",
      detail: activeSms
        ? (activeSms.last_error ?? `${activeSms.name} actif (${activeSms.from_number ?? "sans numéro"})`)
        : "Aucun fournisseur SMS configuré : OTP et rappels SMS inactifs",
    });

    const { count: queued } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");
    services.push({
      key: "notifications",
      label: "Notifications",
      level: (queued ?? 0) > 100 ? "warn" : "ok",
      detail: `${queued ?? 0} notification(s) en attente d'envoi`,
    });

    const { data: hooks } = await supabaseAdmin
      .from("payment_webhooks")
      .select("signature_valid, processed, received_at")
      .order("received_at", { ascending: false })
      .limit(50);
    const invalid = (hooks ?? []).filter((h) => !h.signature_valid).length;
    services.push({
      key: "webhooks",
      label: "Webhooks",
      level: invalid ? "warn" : "ok",
      detail: hooks?.length
        ? `${hooks.length} événement(s) récents, ${invalid} signature(s) invalide(s)`
        : "Aucun rappel reçu pour l'instant",
    });

    services.push({ key: "api", label: "API serveur", level: "ok", detail: "Fonctions serveur opérationnelles" });

    const { data: lastCron } = await supabaseAdmin
      .from("system_events")
      .select("created_at, level, message")
      .eq("area", "cron")
      .order("created_at", { ascending: false })
      .limit(1);
    const cronAt = lastCron?.[0]?.created_at;
    const stale = cronAt ? Date.now() - new Date(cronAt).getTime() > 48 * 3600_000 : true;
    services.push({
      key: "jobs",
      label: "Tâches planifiées",
      level: stale ? "warn" : "ok",
      detail: cronAt ? `Dernière exécution : ${new Date(cronAt).toLocaleString("fr-FR")}` : "Jamais exécutée",
    });

    services.push({
      key: "storage",
      label: "Stockage",
      level: "warn",
      detail: "Aucun espace de stockage configuré (non requis pour le MVP)",
    });

    const { data: errors } = await supabaseAdmin
      .from("system_events")
      .select("area, level, message, created_at")
      .in("level", ["error", "warn"])
      .order("created_at", { ascending: false })
      .limit(20);

    return { services, errors: errors ?? [], checkedAt: new Date().toISOString() };
  });
