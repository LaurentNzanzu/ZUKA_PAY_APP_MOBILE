import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listPlatformTontines, setTontineStatus } from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/admin/tontines")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Tontines — Back-office ZUKA PAY" },
      { name: "description", content: "Toutes les tontines de la plateforme : membres, cotisations, retards et statut." },
      { property: "og:title", content: "Tontines — Back-office ZUKA PAY" },
      { property: "og:description", content: "Suivi des tontines, cotisations et retards sur ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminShell title="Tontines" permission="groups.view">
      <Tontines />
    </AdminShell>
  ),
});

function Tontines() {
  const fetchTontines = useServerFn(listPlatformTontines);
  const setStatus = useServerFn(setTontineStatus);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-tontines"],
    queryFn: () => fetchTontines(),
    retry: false,
  });
  const mutate = useMutation({
    mutationFn: (v: { tontineId: string; status: "active" | "suspended" | "closed" }) =>
      setStatus({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-tontines"] });
      toast.success("Statut de la tontine mis à jour.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [status, setStatusFilter] = useState("");
  const [currency, setCurrency] = useState("");
  const [frequency, setFrequency] = useState("");
  const [minMembers, setMinMembers] = useState("");
  const [from, setFrom] = useState("");
  const [owner, setOwner] = useState("");

  const rows = data.filter(
    (t) =>
      (!status || t.status === status) &&
      (!currency || t.currency === currency) &&
      (!frequency || t.frequency === frequency) &&
      (!minMembers || t.memberCount >= Number(minMembers)) &&
      (!from || t.createdAt.slice(0, 10) >= from) &&
      (!owner || t.owner.toLowerCase().includes(owner.toLowerCase())),
  );

  const field = "rounded-xl border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <Card title="Filtres">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <select className={field} value={status} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="active">Active</option>
            <option value="suspended">Suspendue</option>
            <option value="closed">Clôturée</option>
          </select>
          <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">Toutes les devises</option>
            <option value="CDF">CDF</option>
            <option value="USD">USD</option>
          </select>
          <select className={field} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="">Toutes les fréquences</option>
            <option value="daily">Journalière</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
          </select>
          <input className={field} type="number" min={0} placeholder="Membres min." value={minMembers} onChange={(e) => setMinMembers(e.target.value)} />
          <input className={field} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className={field} placeholder="Créateur" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
      </Card>

      <Card title={`Tontines (${rows.length})`}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2">Tontine</th>
                  <th className="pb-2">Créateur</th>
                  <th className="pb-2">Membres</th>
                  <th className="pb-2">Cotisation</th>
                  <th className="pb-2">Fréquence</th>
                  <th className="pb-2">Collecté / attendu</th>
                  <th className="pb-2">Retards</th>
                  <th className="pb-2">Prochaine échéance</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-border align-top">
                    <td className="py-2">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Ordre : {t.order.join(" → ") || "—"}
                      </div>
                    </td>
                    <td>{t.owner}</td>
                    <td>{t.memberCount}</td>
                    <td>
                      {t.amount.toLocaleString("fr-FR")} {t.currency}
                    </td>
                    <td>{t.frequency}</td>
                    <td>
                      {t.collected.toLocaleString("fr-FR")} / {t.expected.toLocaleString("fr-FR")}
                    </td>
                    <td>{t.late}</td>
                    <td>{t.nextDue ?? "—"}</td>
                    <td>{t.status}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="rounded-lg bg-muted px-3 py-1 text-xs font-medium"
                        onClick={() =>
                          mutate.mutate({
                            tontineId: t.id,
                            status: t.status === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        {t.status === "active" ? "Suspendre" : "Réactiver"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={10} className="py-4 text-sm text-muted-foreground">
                      Aucune tontine ne correspond aux filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
