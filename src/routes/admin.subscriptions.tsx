import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listSubscriptions } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/admin/subscriptions")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Abonnements des groupes — ZUKA PAY" },
    { name: "description", content: "Consultez les abonnements, tarifs appliqués et statuts de paiement." },
    { property: "og:title", content: "Abonnements des groupes — ZUKA PAY" },
    { property: "og:description", content: "Consultez les abonnements et statuts de paiement ZUKA PAY." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <AdminShell title="Abonnements des groupes" permission="payments.view">
      <Subscriptions />
    </AdminShell>
  ),
});

function Subscriptions() {
  const fetchSubs = useServerFn(listSubscriptions);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => fetchSubs(),
    retry: false,
  });

  return (
    <Card title={`${data.length} abonnement(s)`}>
      <p className="mb-4 text-xs text-muted-foreground">
        Le tarif est figé à l'ouverture du cycle : une modification de la grille tarifaire ne change
        jamais un abonnement déjà commencé.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun abonnement enregistré pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Groupe</th>
                <th className="pb-2">Membres</th>
                <th className="pb-2">Tarif</th>
                <th className="pb-2">Période</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Paiement</th>
                <th className="pb-2">Référence</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 font-medium">{s.group_name}</td>
                  <td>{s.member_count}</td>
                  <td className="font-semibold">
                    {Number(s.price_locked).toLocaleString("fr-FR")} {s.currency}
                  </td>
                  <td>
                    {s.period_start} → {s.period_end}
                  </td>
                  <td>{s.status}</td>
                  <td>{s.paid_at ? new Date(s.paid_at).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="font-mono text-xs">{s.transaction_ref ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
