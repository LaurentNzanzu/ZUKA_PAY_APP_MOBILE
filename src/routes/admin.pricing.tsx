import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card, useAdminSession } from "@/components/admin/AdminShell";
import { listPricingTiers, savePricingTier } from "@/lib/admin/admin.functions";
import { can } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/pricing")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Tarification des groupes — ZUKA PAY" },
    { name: "description", content: "Configurez les tranches tarifaires des groupes ZUKA PAY." },
    { property: "og:title", content: "Tarification des groupes — ZUKA PAY" },
    { property: "og:description", content: "Configurez les tranches tarifaires des groupes ZUKA PAY." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <AdminShell title="Tarification des groupes" permission="pricing.view">
      <Pricing />
    </AdminShell>
  ),
});

interface Draft {
  id?: string;
  label: string;
  minMembers: number;
  maxMembers: number | null;
  price: number;
  currency: "USD" | "CDF";
  active: boolean;
  effectiveFrom: string;
}

const emptyDraft = (): Draft => ({
  label: "",
  minMembers: 2,
  maxMembers: 5,
  price: 0,
  currency: "USD",
  active: true,
  effectiveFrom: new Date().toISOString().slice(0, 10),
});

function Pricing() {
  const { data: session } = useAdminSession();
  const editable = can(session, "pricing.manage");
  const fetchTiers = useServerFn(listPricingTiers);
  const save = useServerFn(savePricingTier);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: () => fetchTiers(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (d: Draft) => save({ data: d }),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
      toast.success("Tarif enregistré.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card
        title={`${data.length} tranche(s)`}
        action={
          editable && (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              Nouvelle tranche
            </button>
          )
        }
      >
        <p className="mb-4 text-xs text-muted-foreground">
          Les montants sont stockés en base et appliqués aux nouveaux cycles de facturation
          uniquement.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2">Tranche</th>
                  <th className="pb-2">Membres</th>
                  <th className="pb-2">Prix</th>
                  <th className="pb-2">Entrée en vigueur</th>
                  <th className="pb-2">Statut</th>
                  {editable && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 font-medium">{t.label}</td>
                    <td>
                      {t.min_members}
                      {t.max_members ? `–${t.max_members}` : "+"}
                    </td>
                    <td className="font-semibold">
                      {Number(t.price).toLocaleString("fr-FR")} {t.currency}
                    </td>
                    <td>{t.effective_from}</td>
                    <td>{t.active ? "Active" : "Désactivée"}</td>
                    {editable && (
                      <td className="text-right">
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() =>
                            setDraft({
                              id: t.id,
                              label: t.label,
                              minMembers: t.min_members,
                              maxMembers: t.max_members,
                              price: Number(t.price),
                              currency: t.currency as "USD" | "CDF",
                              active: t.active,
                              effectiveFrom: t.effective_from,
                            })
                          }
                        >
                          Modifier
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {draft && (
        <Card title={draft.id ? "Modifier la tranche" : "Nouvelle tranche"}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(draft);
            }}
          >
            <Field label="Libellé">
              <input
                required
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Prix">
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                className="input"
              />
            </Field>
            <Field label="Membres minimum">
              <input
                required
                type="number"
                min="1"
                value={draft.minMembers}
                onChange={(e) => setDraft({ ...draft, minMembers: Number(e.target.value) })}
                className="input"
              />
            </Field>
            <Field label="Membres maximum (vide = illimité)">
              <input
                type="number"
                min="1"
                value={draft.maxMembers ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, maxMembers: e.target.value ? Number(e.target.value) : null })
                }
                className="input"
              />
            </Field>
            <Field label="Devise">
              <select
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value as "USD" | "CDF" })}
                className="input"
              >
                <option value="USD">USD</option>
                <option value="CDF">CDF</option>
              </select>
            </Field>
            <Field label="Entrée en vigueur">
              <input
                type="date"
                value={draft.effectiveFrom}
                onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })}
                className="input"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Tranche active
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg bg-muted px-4 py-2 text-sm">
                Annuler
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
