import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listAuditLogs } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/admin/audit")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Journal d’audit — ZUKA PAY" },
    { name: "description", content: "Consultez les événements sensibles et actions administratives ZUKA PAY." },
    { property: "og:title", content: "Journal d’audit — ZUKA PAY" },
    { property: "og:description", content: "Événements sensibles et actions administratives ZUKA PAY." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <AdminShell title="Journal d'audit" permission="admins.view">
      <AuditLog />
    </AdminShell>
  ),
});

function AuditLog() {
  const fetchLogs = useServerFn(listAuditLogs);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-audit"], queryFn: () => fetchLogs(), retry: false });
  const [search, setSearch] = useState("");

  const rows = data.filter(
    (l) =>
      !search ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.actor_email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card
      title={`${rows.length} événement(s)`}
      action={
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Action ou administrateur"
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
        />
      }
    >
      <p className="mb-4 text-xs text-muted-foreground">
        Journal en écriture seule : les entrées ne peuvent être ni modifiées ni supprimées.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-2">
          {rows.map((l) => (
            <details key={l.id} className="rounded-xl border border-border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{l.action}</span>
                <span className="text-muted-foreground">{l.actor_email ?? "système"}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString("fr-FR")}
                </span>
              </summary>
              <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                <div>Cible : {l.entity_type ?? "—"} {l.entity_id ?? ""}</div>
                <div>Résultat : {l.result}</div>
                <div>IP : {l.ip_address ?? "—"}</div>
                {l.old_value != null && (
                  <pre className="overflow-x-auto rounded-lg bg-muted p-2">
                    {JSON.stringify(l.old_value, null, 2)}
                  </pre>
                )}
                {l.new_value != null && (
                  <pre className="overflow-x-auto rounded-lg bg-muted p-2">
                    {JSON.stringify(l.new_value, null, 2)}
                  </pre>
                )}
              </dl>
            </details>
          ))}
          {!rows.length && <p className="text-sm text-muted-foreground">Aucun événement.</p>}
        </div>
      )}
    </Card>
  );
}
