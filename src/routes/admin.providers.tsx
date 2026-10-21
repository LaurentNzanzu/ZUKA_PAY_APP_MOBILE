import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card, useAdminSession } from "@/components/admin/AdminShell";
import { listProviders, saveProvider, testProvider } from "@/lib/admin/admin.functions";
import { can } from "@/lib/admin/permissions";

export const Route = createFileRoute("/admin/providers")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Fournisseurs Mobile Money — ZUKA PAY" },
    { name: "description", content: "Configurez et testez les fournisseurs Mobile Money de ZUKA PAY." },
    { property: "og:title", content: "Fournisseurs Mobile Money — ZUKA PAY" },
    { property: "og:description", content: "Configurez et testez les fournisseurs Mobile Money de ZUKA PAY." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <AdminShell title="Fournisseurs Mobile Money" permission="mobile_money.view">
      <Providers />
    </AdminShell>
  ),
});

interface Draft {
  id?: string;
  name: string;
  slug: string;
  environment: "sandbox" | "production";
  enabled: boolean;
  priority: number;
  countries: string[];
  currencies: string[];
  apiBaseUrl: string;
  publicKey: string;
  secretRef: string;
}

const emptyDraft = (): Draft => ({
  name: "",
  slug: "",
  environment: "sandbox",
  enabled: false,
  priority: 100,
  countries: ["CD"],
  currencies: ["CDF", "USD"],
  apiBaseUrl: "",
  publicKey: "",
  secretRef: "",
});

function Providers() {
  const { data: session } = useAdminSession();
  const editable = can(session, "mobile_money.manage");
  const fetchProviders = useServerFn(listProviders);
  const save = useServerFn(saveProvider);
  const test = useServerFn(testProvider);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => fetchProviders(),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (d: Draft) => save({ data: d }),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      toast.success("Fournisseur enregistré.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      if (res.status === "ok") toast.success("Connexion réussie.");
      else toast.error("Test échoué", { description: res.lastError ?? undefined });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card
        title={`${data.length} fournisseur(s)`}
        action={
          editable && (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              Ajouter un agrégateur
            </button>
          )
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">
          Les clés secrètes ne sont jamais stockées en base ni affichées : seul le nom du secret
          serveur est enregistré, avec ses 4 derniers caractères pour vérification.
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          Confirmation automatique : chaque paiement est initié chez l'agrégateur puis passe de « En
          attente » à « Réussie » dès que celui-ci confirme (webhook signé ou lecture de statut).
          Renseignez l'URL de rappel ci-dessous chez l'opérateur.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun fournisseur configuré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2">Fournisseur</th>
                  <th className="pb-2">Env.</th>
                  <th className="pb-2">Priorité</th>
                  <th className="pb-2">Devises</th>
                  <th className="pb-2">Clé</th>
                  <th className="pb-2">Statut</th>
                  {editable && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 font-medium">
                      {p.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.enabled ? "activé" : "désactivé"}
                      </span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        Rappel : /api/public/webhooks/mobile-money/{p.slug}
                      </span>
                    </td>
                    <td>{p.environment}</td>
                    <td>{p.priority}</td>
                    <td>{(p.currencies ?? []).join(", ")}</td>
                    <td className="font-mono text-xs">
                      {p.secret_last4 ? `••••••••${p.secret_last4}` : "—"}
                    </td>
                    <td>
                      {p.status}
                      {p.last_error && (
                        <span className="block text-xs text-muted-foreground">{p.last_error}</span>
                      )}
                    </td>
                    {editable && (
                      <td className="space-x-3 text-right text-xs">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => testMutation.mutate(p.id)}
                          disabled={testMutation.isPending}
                        >
                          Tester
                        </button>
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            setDraft({
                              id: p.id,
                              name: p.name,
                              slug: p.slug,
                              environment: p.environment as "sandbox" | "production",
                              enabled: p.enabled,
                              priority: p.priority,
                              countries: p.countries ?? [],
                              currencies: p.currencies ?? [],
                              apiBaseUrl: p.api_base_url ?? "",
                              publicKey: p.public_key ?? "",
                              secretRef: p.secret_ref ?? "",
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
        <Card title={draft.id ? "Modifier le fournisseur" : "Nouveau fournisseur"}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(draft);
            }}
          >
            <Field label="Nom">
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" />
            </Field>
            <Field label="Identifiant technique (slug)">
              <input required value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="input" />
            </Field>
            <Field label="Environnement">
              <select
                value={draft.environment}
                onChange={(e) => setDraft({ ...draft, environment: e.target.value as Draft["environment"] })}
                className="input"
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </Field>
            <Field label="Priorité (1 = premier)">
              <input
                type="number"
                min="1"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                className="input"
              />
            </Field>
            <Field label="URL de l'API">
              <input value={draft.apiBaseUrl} onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value })} className="input" />
            </Field>
            <Field label="Clé publique / identifiant marchand">
              <input value={draft.publicKey} onChange={(e) => setDraft({ ...draft, publicKey: e.target.value })} className="input" />
            </Field>
            <Field label="Pays (séparés par une virgule)">
              <input
                value={draft.countries.join(",")}
                onChange={(e) => setDraft({ ...draft, countries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                className="input"
              />
            </Field>
            <Field label="Devises (séparées par une virgule)">
              <input
                value={draft.currencies.join(",")}
                onChange={(e) => setDraft({ ...draft, currencies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                className="input"
              />
            </Field>
            <Field label="Nom du secret serveur (ex. AIRTEL_MONEY_SECRET)">
              <input value={draft.secretRef} onChange={(e) => setDraft({ ...draft, secretRef: e.target.value })} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              Fournisseur activé
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg bg-muted px-4 py-2 text-sm">
                Annuler
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
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
