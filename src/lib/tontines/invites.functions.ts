import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function srv() {
  return await import("./tontines.server");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

type InviteState = "ok" | "invalid" | "revoked" | "expired" | "closed" | "full";

async function loadInvite(token: string) {
  const { supabaseAdmin } = await srv();
  if (!TOKEN_RE.test(token)) return { state: "invalid" as InviteState, group: null };
  const { data: g } = await (supabaseAdmin as any)
    .from("tontines")
    .select(
      "id, name, description, photo_url, currency, amount, frequency, total_dues, max_members, start_date, status, rules, late_penalty_enabled, late_penalty_amount, invite_revoked_at, invite_expires_at, archived_at",
    )
    .eq("invite_token", token)
    .maybeSingle();
  if (!g) return { state: "invalid" as InviteState, group: null };
  const { count } = await supabaseAdmin
    .from("tontine_members")
    .select("id", { count: "exact", head: true })
    .eq("tontine_id", g.id)
    .eq("status", "active");
  const members = count ?? 0;
  let state: InviteState = "ok";
  if (g.invite_revoked_at) state = "revoked";
  else if (g.invite_expires_at && new Date(g.invite_expires_at).getTime() < Date.now()) state = "expired";
  else if (g.archived_at || ["closed", "archived", "deleted", "cancelled"].includes(g.status)) state = "closed";
  else if (members >= g.max_members) state = "full";
  return { state, group: { ...g, members } };
}

/** Public: safe, newcomer-visible group info for a valid invitation token. */
export const getInvitePreview = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "").slice(0, 64) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await srv();
    const { state, group } = await loadInvite(data.token);
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["store.android_url", "store.ios_url"]);
    const s = (k: string) => {
      const v = settings?.find((x) => x.key === k)?.value;
      return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
    };
    const stores = { android: s("store.android_url"), ios: s("store.ios_url") };
    if (!group || state === "invalid") return { state, group: null, stores };
    const rules = (group.rules ?? {}) as Record<string, unknown>;
    return {
      state,
      stores,
      group: {
        name: group.name as string,
        description: (group.description ?? "") as string,
        photoUrl: (group.photo_url ?? null) as string | null,
        currency: group.currency as string,
        amount: Number(group.amount),
        frequency: group.frequency as string,
        totalDues: group.total_dues as number,
        maxMembers: group.max_members as number,
        members: group.members as number,
        startDate: group.start_date as string,
        latePenalty: group.late_penalty_enabled ? Number(group.late_penalty_amount) : 0,
        partialPayments: rules['partialPayments'] !== false,
      },
    };
  });

/** Signed-in viewer's relation to the invited group. */
export const getMyInviteStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "").slice(0, 64) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, memberRow } = await srv();
    const { group } = await loadInvite(data.token);
    if (!group) return { relation: "none" as const, groupId: null };
    const m = await memberRow(group.id, context.userId);
    if (m && m.status === "active") return { relation: "member" as const, groupId: group.id as string };
    const { data: last } = await supabaseAdmin
      .from("tontine_join_requests" as never)
      .select("status")
      .eq("tontine_id", group.id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const st = (last as { status?: string } | null)?.status;
    if (st === "pending") return { relation: "pending" as const, groupId: null };
    if (st === "refused") return { relation: "refused" as const, groupId: null };
    return { relation: "none" as const, groupId: null };
  });

export const requestToJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "").slice(0, 64) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, memberRow, notify } = await srv();
    const { state, group } = await loadInvite(data.token);
    if (!group || state !== "ok") throw new Error(`INVITATION_${state.toUpperCase()}`);
    const m = await memberRow(group.id, context.userId);
    if (m && m.status === "active") throw new Error("DEJA_MEMBRE");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", context.userId)
      .maybeSingle();
    const { error } = await (supabaseAdmin as any).from("tontine_join_requests").insert({
      tontine_id: group.id,
      user_id: context.userId,
      name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
    });
    if (error) {
      if (error.code === "23505") throw new Error("DEMANDE_EN_ATTENTE");
      throw new Error(error.message);
    }
    const { data: admins } = await supabaseAdmin
      .from("tontine_members")
      .select("user_id")
      .eq("tontine_id", group.id)
      .eq("role", "admin")
      .eq("status", "active");
    for (const a of admins ?? [])
      if (a.user_id)
        await notify({
          userId: a.user_id,
          tontineId: group.id,
          kind: "join_request",
          title: "Nouvelle demande d'adhésion",
          body: `${profile?.full_name || "Une personne"} demande à rejoindre « ${group.name} ».`,
        });
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "group.join_request",
      entity_type: "tontine",
      entity_id: group.id,
      result: "success",
    });
    return { ok: true };
  });

/** Admin: invitation link + pending requests (with a dispute flag, never details). */
export const getGroupInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, memberRow } = await srv();
    const me = await memberRow(data.groupId, context.userId);
    if (!me || me.status !== "active" || me.role !== "admin") return { isAdmin: false as const };
    const { data: g } = await (supabaseAdmin as any)
      .from("tontines")
      .select("invite_token, invite_revoked_at")
      .eq("id", data.groupId)
      .single();
    const { data: reqs } = await (supabaseAdmin as any)
      .from("tontine_join_requests")
      .select("id, user_id, name, phone, created_at")
      .eq("tontine_id", data.groupId)
      .eq("status", "pending")
      .order("created_at");
    const list = (reqs ?? []) as { id: string; user_id: string; name: string; phone: string; created_at: string }[];
    const withFlag = await Promise.all(
      list.map(async (r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        createdAt: r.created_at,
        hasDisputes: await hasOpenDisputes(r.user_id, data.groupId),
      })),
    );
    return {
      isAdmin: true as const,
      token: g.invite_token as string,
      revoked: Boolean(g.invite_revoked_at),
      requests: withFlag,
    };
  });

async function hasOpenDisputes(userId: string, excludeGroup: string) {
  const { supabaseAdmin } = await srv();
  const { count } = await (supabaseAdmin as any)
    .from("member_debts")
    .select("id", { count: "exact", head: true })
    .eq("debtor_user_id", userId)
    .eq("status", "active")
    .neq("tontine_id", excludeGroup);
  return (count ?? 0) > 0;
}

export const decideJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; accept: boolean; override?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity, notify, reassignBeneficiaryOrder } = await srv();
    const { data: req } = await (supabaseAdmin as any)
      .from("tontine_join_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req || req.status !== "pending") throw new Error("DEMANDE_INTROUVABLE");
    await requireGroupAdmin(req.tontine_id, context.userId);
    const { data: tontine } = await supabaseAdmin
      .from("tontines")
      .select("name, max_members, amount")
      .eq("id", req.tontine_id)
      .single();
    const now = new Date().toISOString();

    if (!data.accept) {
      await (supabaseAdmin as any)
        .from("tontine_join_requests")
        .update({ status: "refused", decided_by: context.userId, decided_at: now })
        .eq("id", req.id);
      await notify({
        userId: req.user_id,
        tontineId: req.tontine_id,
        kind: "join_refused",
        title: "Demande non acceptée",
        body: `Votre demande pour rejoindre « ${tontine?.name} » n'a pas été acceptée.`,
      });
      await logActivity(req.tontine_id, context.userId, "member", `Demande d'adhésion de ${req.name || "un demandeur"} refusée.`);
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "group.join_refused",
        entity_type: "tontine",
        entity_id: req.tontine_id,
        new_value: { request_id: req.id } as never,
        result: "success",
      });
      return { ok: true };
    }

    const disputes = await hasOpenDisputes(req.user_id, req.tontine_id);
    if (disputes && !data.override) throw new Error("LITIGES_CONFIRMATION_REQUISE");

    const { data: members } = await supabaseAdmin
      .from("tontine_members")
      .select("id, position, user_id, status")
      .eq("tontine_id", req.tontine_id);
    const active = (members ?? []).filter((m) => m.status === "active");
    if (active.some((m) => m.user_id === req.user_id)) throw new Error("DEJA_MEMBRE");
    if (tontine && active.length >= tontine.max_members) throw new Error("GROUPE_COMPLET");

    const position = Math.max(0, ...active.map((m) => m.position)) + 1;
    const { data: inserted, error } = await supabaseAdmin
      .from("tontine_members")
      .insert({
        tontine_id: req.tontine_id,
        user_id: req.user_id,
        name: req.name || "Nouveau membre",
        phone: req.phone || "",
        role: "member",
        position,
        acceptance: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: periods } = await supabaseAdmin
      .from("contribution_periods")
      .select("id")
      .eq("tontine_id", req.tontine_id);
    if (periods?.length && tontine)
      await supabaseAdmin.from("contributions").insert(
        periods.map((p) => ({
          tontine_id: req.tontine_id,
          period_id: p.id,
          member_id: inserted.id,
          amount_due: tontine.amount,
          amount_paid: 0,
          status: "pending",
        })),
      );
    await reassignBeneficiaryOrder(req.tontine_id);
    await (supabaseAdmin as any)
      .from("tontine_join_requests")
      .update({ status: "accepted", decided_by: context.userId, decided_at: now, override_disputes: disputes })
      .eq("id", req.id);
    await notify({
      userId: req.user_id,
      tontineId: req.tontine_id,
      kind: "join_accepted",
      title: "Demande acceptée",
      body: `Bienvenue dans « ${tontine?.name} » !`,
    });
    await logActivity(
      req.tontine_id,
      context.userId,
      "member",
      disputes
        ? `${req.name || "Un membre"} a été accepté(e) malgré des litiges en cours ailleurs.`
        : `${req.name || "Un membre"} a rejoint le groupe.`,
    );
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: disputes ? "group.join_accepted_despite_disputes" : "group.join_accepted",
      entity_type: "tontine",
      entity_id: req.tontine_id,
      new_value: { request_id: req.id, override_disputes: disputes } as never,
      result: "success",
    });
    return { ok: true };
  });

export const rotateInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, requireGroupAdmin, logActivity } = await srv();
    await requireGroupAdmin(data.groupId, context.userId);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await (supabaseAdmin as any)
      .from("tontines")
      .update({ invite_token: token, invite_revoked_at: null, invite_expires_at: null })
      .eq("id", data.groupId);
    await logActivity(data.groupId, context.userId, "group", "Le lien d'invitation a été renouvelé ; l'ancien ne fonctionne plus.");
    return { token };
  });
