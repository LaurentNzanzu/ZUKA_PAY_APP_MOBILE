import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listSmsProviders, saveSmsProvider, testSmsProvider } from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/admin/sms")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Fournisseur SMS — Back-office ZUKA PAY" },
      { name: "description", content: "Configurez le fournisseur SMS utilisé pour les codes de vérification et les rappels." },
      { property: "og:title", content: "Fournisseur SMS — Back-office ZUKA PAY" },
      { property: "og:description", content: "Configuration SMS de la plateforme ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminShell title="Fournisseur SMS" permission="settings.view">
      <Sms />
    </AdminShell>
  ),
});

interface Draft {
  environment: "sandbox" | "production";
  enabled: boolean;
  fromNumber: string;
  apiBaseUrl: string;
  accountSid: string;
  countries: string;
  secretRef: string;
}

function Sms() {
  const fetchProviders = useServerFn(listSmsProviders);
  const save = useServerFn(saveSmsProvider);
  const test = useServerFn(testSmsProvider);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sms"],
    queryFn: () => fetchProviders(),
    retry: false,
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(
        data.map((p) => [
          p.id,
          {
            environment: (p.environment as Draft["environment"]) ?? "sandbox",
            enabled: p.enabled,
            fromNumber: p.from_number ?? "",
            apiBaseUrl: p.api_base_url ?? "",
            accountSid: p.account_sid ?? "",
            countries: (p.countries ?? []).join(","),
            secretRef: "",
          },
        ]),
      ),
    );
  }, [data]);

  const mutate = useMutation({
    mutationFn: (v: { id: string; d: Draft }) =>
      save({
        data: {
          id: v.id,
          environment: v.d.environment,
          enabled: v.d.enabled,
          fromNumber: v.d.fromNumber,
          apiBaseUrl: v.d.apiBaseUrl,
          accountSid: v.d.accountSid,
          countries: v.d.countries.split(",").map((c) => c.trim()).filter(Boolean),
          secretRef: v.d.secretRef,
        },
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin-sms"] });
      toast.success(
        res.secretPresent
          ? "Fournisseur SMS enregistré."
          : "Enregistré, mais le secret indiqué est introuvable côté serveur.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runTest = useMutation({
    mutationFn: (id: string) => test({ data: { id, to: testTo } }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["admin-sms"] });
      if (res.ok) toast.success("SMS de test envoyé.");
      else toast.error(`Échec : ${res.error}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";
  const providers = data ?? [];
  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Card title="Comment ça marche">
        <p className="text-sm text-muted-foreground">
          Le jeton d'authentification n'est jamais enregistré ici : indiquez le nom de la variable
          sécurisée qui le contient (par exemple <code>SMS_TWILIO_AUTH_TOKEN</code>). Seuls les
          quatre derniers caractères sont affichés, et uniquement pour vérification.
        </p>
      </Card>

      {providers.map((p) => {
        const d = drafts[p.id];
        if (!d) return null;
        return (
          <Card
            key={p.id}
            title={`${p.name} — ${p.status}`}
            action={
              <span className="text-xs text-muted-foreground">
                {p.secret_last4 ? `Secret •••${p.secret_last4}` : "Secret non configuré"}
              </span>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Environnement
                <select
                  className={field}
                  value={d.environment}
                  onChange={(e) =>
                    setDrafts((s) => ({ ...s, [p.id]: { ...d, environment: e.target.value as Draft["environment"] } }))
                  }
                >
                  <option value="sandbox">Bac à sable</option>
                  <option value="production">Production</option>
                </select>
              </label>
              <label className="text-sm">
                Numéro émetteur
                <input
                  className={field}
                  value={d.fromNumber}
                  placeholder="+1..."
                  onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, fromNumber: e.target.value } }))}
                />
              </label>
              <label className="text-sm">
                Identifiant de compte (Account SID)
                <input
                  className={field}
                  value={d.accountSid}
                  onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, accountSid: e.target.value } }))}
                />
              </label>
              <label className="text-sm">
                URL de l'API
                <input
                  className={field}
                  value={d.apiBaseUrl}
                  onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, apiBaseUrl: e.target.value } }))}
                />
              </label>
              <label className="text-sm">
                Pays autorisés (séparés par des virgules)
                <input
                  className={field}
                  value={d.countries}
                  onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, countries: e.target.value } }))}
                />
              </label>
              <label className="text-sm">
                Nom de la variable secrète
                <input
                  className={field}
                  placeholder="SMS_TWILIO_AUTH_TOKEN"
                  value={d.secretRef}
                  onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, secretRef: e.target.value } }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, enabled: e.target.checked } }))}
                />
                Activer ce fournisseur
              </label>
            </div>

            {p.last_error && <p className="mt-3 text-xs text-destructive">Dernière erreur : {p.last_error}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={mutate.isPending}
                onClick={() => mutate.mutate({ id: p.id, d })}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                Enregistrer
              </button>
              <input
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="+243..."
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <button
                type="button"
                disabled={!testTo || runTest.isPending}
                onClick={() => runTest.mutate(p.id)}
                className="rounded-xl bg-muted px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Envoyer un SMS de test
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
