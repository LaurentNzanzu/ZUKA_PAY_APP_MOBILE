import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listPlatformNotifications } from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/admin/notifications")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Notifications — Back-office ZUKA PAY" },
      { name: "description", content: "Historique des notifications envoyées aux membres de ZUKA PAY." },
      { property: "og:title", content: "Notifications — Back-office ZUKA PAY" },
      { property: "og:description", content: "Suivi des rappels et notifications ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminShell title="Notifications" permission="settings.view">
      <Notifications />
    </AdminShell>
  ),
});

function Notifications() {
  const fetchNotifications = useServerFn(listPlatformNotifications);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => fetchNotifications(),
    retry: false,
  });
  const [kind, setKind] = useState("");
  const kinds = Array.from(new Set(data.map((n) => n.kind)));
  const rows = data.filter((n) => !kind || n.kind === kind);

  return (
    <Card title={`Notifications (${rows.length})`}>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="mb-4 rounded-xl border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">Tous les types</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Date</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Titre</th>
                <th className="pb-2">Canal</th>
                <th className="pb-2">État</th>
                <th className="pb-2">Lue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="py-2">{new Date(n.created_at).toLocaleString("fr-FR")}</td>
                  <td>{n.kind}</td>
                  <td>
                    <div className="font-medium">{n.title}</div>
                    <div className="text-xs text-muted-foreground">{n.body}</div>
                  </td>
                  <td>{n.channel}</td>
                  <td>{n.error ? `erreur : ${n.error}` : n.status}</td>
                  <td>{n.read_at ? "oui" : "non"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="py-4 text-sm text-muted-foreground">
                    Aucune notification.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
