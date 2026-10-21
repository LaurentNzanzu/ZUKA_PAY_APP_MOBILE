import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listTransactions } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/admin/transactions")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Transactions Mobile Money — ZUKA PAY" },
    { name: "description", content: "Suivez les transactions Mobile Money et leurs statuts de confirmation." },
    { property: "og:title", content: "Transactions Mobile Money — ZUKA PAY" },
    { property: "og:description", content: "Suivez les transactions Mobile Money et leurs confirmations." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <AdminShell title="Transactions" permission="transactions.view">
      <Transactions />
    </AdminShell>
  ),
});

const STATUSES = ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED"];

function Transactions() {
  const fetchTx = useServerFn(listTransactions);
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-transactions"], queryFn: () => fetchTx(), retry: false });
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const rows = data.filter(
    (t) =>
      (!status || t.status === status) &&
      (!search ||
        t.reference.toLowerCase().includes(search.toLowerCase()) ||
        (t.msisdn ?? "").includes(search)),
  );

  return (
    <Card
      title={`${rows.length} transaction(s)`}
      action={
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Référence ou numéro"
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Tous les statuts</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune transaction.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Date</th>
                <th className="pb-2">Référence</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Montant</th>
                <th className="pb-2">Numéro</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-2">{new Date(t.created_at).toLocaleString("fr-FR")}</td>
                  <td className="font-mono text-xs">{t.reference}</td>
                  <td>{t.kind === "subscription" ? "Abonnement" : "Cotisation"}</td>
                  <td className="font-semibold">
                    {Number(t.amount).toLocaleString("fr-FR")} {t.currency}
                  </td>
                  <td>{t.msisdn ?? "—"}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
