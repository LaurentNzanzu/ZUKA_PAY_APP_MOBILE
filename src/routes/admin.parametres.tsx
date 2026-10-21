import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell, Card } from "@/components/admin/AdminShell";
import { listSettings, saveSetting } from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/admin/parametres")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Paramètres — Back-office ZUKA PAY" },
      { name: "description", content: "Configurez le nom, les langues, les devises, les limites et la maintenance de ZUKA PAY." },
      { property: "og:title", content: "Paramètres — Back-office ZUKA PAY" },
      { property: "og:description", content: "Configuration générale de la plateforme ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminShell title="Paramètres de l'application" permission="settings.view">
      <Settings />
    </AdminShell>
  ),
});

function Settings() {
  const fetchSettings = useServerFn(listSettings);
  const save = useServerFn(saveSetting);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => fetchSettings(),
    retry: false,
  });
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      setDraft(
        Object.fromEntries(
          data.map((s) => [
            s.key,
            JSON.stringify(s.value),
          ]),
        ),
      );
    }
  }, [data]);

  const mutate = useMutation({
    mutationFn: (v: { key: string; value: string }) => save({ data: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("Paramètre enregistré.");
    },
    onError: (e: Error) =>
      toast.error(e.message === "VALEUR_JSON_INVALIDE" ? "Valeur invalide." : e.message),
  });

  const rows = data ?? [];
  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <Card title="Configuration">
      <p className="mb-4 text-xs text-muted-foreground">
        Les valeurs sont enregistrées telles quelles : texte entre guillemets, nombres et listes au
        format JSON. Chaque modification est tracée dans le journal d'audit.
      </p>
      <div className="space-y-3">
        {rows.map((s) => (
          <div key={s.key} className="grid gap-2 sm:grid-cols-[260px_1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium">{s.label ?? s.key}</p>
              <p className="text-xs text-muted-foreground">{s.key}</p>
            </div>
            <input
              value={draft[s.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
              className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <button
              type="button"
              disabled={mutate.isPending}
              onClick={() => mutate.mutate({ key: s.key, value: draft[s.key] ?? "" })}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Enregistrer
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
