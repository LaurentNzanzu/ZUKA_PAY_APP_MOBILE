import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import {
  getPlatformUser,
  listPlatformUsers,
  setUserSuspended,
} from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/admin/utilisateurs")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Utilisateurs — Back-office ZUKA PAY" },
      { name: "description", content: "Consultez et gérez les comptes utilisateurs de ZUKA PAY." },
      { property: "og:title", content: "Utilisateurs — Back-office ZUKA PAY" },
      { property: "og:description", content: "Comptes, groupes et activité des utilisateurs ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminShell title="Utilisateurs" permission="users.view">
      <Users />
    </AdminShell>
  ),
});

function Users() {
  const fetchUsers = useServerFn(listPlatformUsers);
  const fetchUser = useServerFn(getPlatformUser);
  const suspend = useServerFn(setUserSuspended);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["admin-user", selected],
    queryFn: () => fetchUser({ data: { userId: selected! } }),
    enabled: Boolean(selected),
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: (v: { userId: string; suspended: boolean }) => suspend({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Statut mis à jour.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const q = search.toLowerCase();
  const rows = data.filter(
    (u) =>
      !q ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.fullName ?? "").toLowerCase().includes(q) ||
      (u.phone ?? "").includes(search),
  );

  return (
    <div className="space-y-4">
      <Card title={`Comptes (${rows.length})`}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom, un e-mail ou un numéro"
          className="mb-4 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2">Utilisateur</th>
                  <th className="pb-2">Téléphone</th>
                  <th className="pb-2">Rôle</th>
                  <th className="pb-2">Groupes</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-2">
                      <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setSelected(u.id)}>
                        {u.fullName ?? u.email ?? "Sans nom"}
                      </button>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td>{u.phone ?? "—"}</td>
                    <td>{u.role}</td>
                    <td>{u.groups}</td>
                    <td>{u.suspended ? "Suspendu" : "Actif"}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => toggle.mutate({ userId: u.id, suspended: !u.suspended })}
                        className="rounded-lg bg-muted px-3 py-1 text-xs font-medium"
                      >
                        {u.suspended ? "Réactiver" : "Suspendre"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="py-4 text-sm text-muted-foreground">
                      Aucun utilisateur.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Card
          title="Fiche utilisateur"
          action={
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelected(null)}>
              Fermer
            </button>
          }
        >
          {detail.isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground">Profil</h3>
                <p className="mt-1 text-sm">{detail.data?.profile?.full_name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{detail.data?.profile?.email ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{detail.data?.profile?.phone ?? "—"}</p>
                <h3 className="mt-4 text-xs font-semibold text-muted-foreground">Tontines</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {detail.data?.memberships.map((m) => (
                    <li key={m.id}>
                      {m.name} — {m.role} ({m.status})
                    </li>
                  ))}
                  {!detail.data?.memberships.length && <li className="text-muted-foreground">Aucune</li>}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground">Activité récente</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {detail.data?.activity.map((a) => (
                    <li key={a.id} className="text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("fr-FR")} — {a.message}
                    </li>
                  ))}
                  {!detail.data?.activity.length && <li className="text-muted-foreground">Aucune activité</li>}
                </ul>
                <h3 className="mt-4 text-xs font-semibold text-muted-foreground">Transactions</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {detail.data?.transactions.map((t) => (
                    <li key={t.reference}>
                      {t.reference} — {Number(t.amount).toLocaleString("fr-FR")} {t.currency} ({t.status})
                    </li>
                  ))}
                  {!detail.data?.transactions.length && <li className="text-muted-foreground">Aucune</li>}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
