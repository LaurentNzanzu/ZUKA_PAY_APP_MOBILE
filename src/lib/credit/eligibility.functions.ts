import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Collective mutual-credit eligibility of a tontine group. Read-only: values are
 * computed in the database from real contributions and protected by RLS
 * (group members + platform admins with groups.view).
 */
export const getGroupEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.groupId)) throw new Error("Groupe invalide");
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: status }, { data: periods }, { data: events }] = await Promise.all([
      sb.from("group_eligibility").select("*").eq("tontine_id", data.groupId).maybeSingle(),
      sb
        .from("group_period_performance")
        .select("idx, due_date, members_count, late_count, closed, successful")
        .eq("tontine_id", data.groupId)
        .eq("closed", true)
        .order("due_date", { ascending: false })
        .limit(60),
      sb
        .from("group_eligibility_events")
        .select("id, kind, reason, created_at")
        .eq("tontine_id", data.groupId)
        .neq("kind", "period_closed")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const years = new Map<number, number>();
    for (const p of periods ?? []) {
      const y = Number(p.due_date.slice(0, 4));
      years.set(y, (years.get(y) ?? 0) + p.late_count);
    }
    return {
      status,
      periods: periods ?? [],
      years: [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, late]) => ({ year, late })),
      events: events ?? [],
    };
  });
