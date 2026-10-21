import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { getSystemHealth } from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/admin/sante")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Santé du système — Back-office ZUKA PAY" },
      { name: "description", content: "État en direct de la base de données, des paiements, des SMS et des tâches planifiées." },
      { property: "og:title", content: "Santé du système — Back-office ZUKA PAY" },
      { property: "og:description", content: "Supervision des services de la plateforme ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminShell title="Santé du système" permission="settings.view">
      <Health />
    </AdminShell>
  ),
});

const DOT = { ok: "🟢", warn: "🟡", error: "🔴" } as const;

function Health() {
  const fetchHealth = useServerFn(getSystemHealth);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => fetchHealth(),
    retry: false,
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Vérification des services…</p>;
  if (error || !data) return <p className="text-sm text-muted-foreground">Supervision indisponible.</p>;

  return (
    <div className="space-y-4">
      <Card title={`Services — vérifié à ${new Date(data.checkedAt).toLocaleTimeString("fr-FR")}`}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.services.map((s) => (
            <li key={s.key} className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">
                {DOT[s.level]} {s.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Dernières erreurs">
        {data.errors.length ? (
          <ul className="space-y-1 text-sm">
            {data.errors.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("fr-FR")}
                </span>
                <span className="font-medium">{e.area}</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune erreur enregistrée.</p>
        )}
      </Card>
    </div>
  );
}
