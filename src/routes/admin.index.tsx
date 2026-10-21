import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell, Card, Stat, useAdminSession } from "@/components/admin/AdminShell";
import { bootstrapSuperAdmin, getAdminStats } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/admin/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Tableau de bord administrateur — ZUKA PAY" },
      { name: "description", content: "Indicateurs de gestion et de paiement de la plateforme ZUKA PAY." },
      { property: "og:title", content: "Tableau de bord administrateur — ZUKA PAY" },
      { property: "og:description", content: "Indicateurs de gestion et de paiement de la plateforme ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: session } = useAdminSession();
  if (session && session.needsBootstrap && !session.isAdmin) return <Bootstrap />;
  return (
    <AdminShell title="Tableau de bord">
      <Dashboard />
    </AdminShell>
  );
}

function Bootstrap() {
  const claim = useServerFn(bootstrapSuperAdmin);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => claim(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-session"] });
      toast.success("Vous êtes maintenant le super administrateur de ZUKA PAY.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-deep px-6">
      <div className="max-w-md rounded-3xl bg-card p-8 text-center shadow-card">
        <h1 className="font-display text-xl font-bold">Initialiser le back-office</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aucun super administrateur n'existe encore. Votre compte deviendra propriétaire de la
          plateforme ZUKA PAY. Cette opération n'est possible qu'une seule fois.
        </p>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Devenir super administrateur
        </button>
      </div>
    </div>
  );
}

function Dashboard() {
  const fetchStats = useServerFn(getAdminStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement des statistiques…</p>;
  if (error || !data)
    return <p className="text-sm text-muted-foreground">Statistiques indisponibles pour votre rôle.</p>;

  const money = (rec: Record<string, number>) =>
    Object.keys(rec).length
      ? Object.entries(rec)
          .map(([c, v]) => `${v.toLocaleString("fr-FR")} ${c}`)
          .join(" · ")
      : "0";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Utilisateurs" value={data.users.total} hint={`${data.users.new30d} nouveaux (30 j)`} />
        <Stat label="Administrateurs" value={data.users.admins} />
        <Stat label="Abonnements de groupes" value={data.groups.subscriptions} hint={`${data.groups.paid} payés · ${data.groups.pending} en attente`} />
        <Stat label="Revenus encaissés" value={money(data.revenue)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Transactions">
          <p className="font-display text-2xl font-bold">{data.transactions.total}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(data.transactions.byStatus).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="text-muted-foreground">{status}</span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
            {!data.transactions.total && (
              <li className="text-sm text-muted-foreground">Aucune transaction enregistrée.</li>
            )}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Volumes réussis : {money(data.transactions.volumes)}
          </p>
        </Card>

        <Card title="Fournisseurs Mobile Money">
          {data.providers.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2">Fournisseur</th>
                  <th className="pb-2">Transactions</th>
                  <th className="pb-2">Réussite</th>
                  <th className="pb-2">Échecs</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 font-medium">
                      {p.name}
                      {!p.enabled && <span className="ml-2 text-xs text-muted-foreground">(désactivé)</span>}
                    </td>
                    <td>{p.total}</td>
                    <td>{p.successRate}%</td>
                    <td>{p.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun fournisseur configuré.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
