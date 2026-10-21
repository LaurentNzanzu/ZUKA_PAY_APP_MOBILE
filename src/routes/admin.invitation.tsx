import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/admin/invitation")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Invitation administrateur — ZUKA PAY" },
      { name: "description", content: "Acceptez votre invitation au back-office ZUKA PAY." },
      { property: "og:title", content: "Invitation administrateur — ZUKA PAY" },
      { property: "og:description", content: "Acceptez votre invitation au back-office ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) =>
    typeof search['token'] === "string" ? { token: search['token'] } : {},
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = useServerFn(acceptInvitation);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error("Lien d'invitation invalide.");
      return;
    }
    setBusy(true);
    try {
      if (password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
      }
      await accept({ data: { token } });
      await queryClient.invalidateQueries({ queryKey: ["admin-session"] });
      toast.success("Invitation acceptée. Bienvenue dans le back-office ZUKA PAY.");
      void navigate({ to: "/admin", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      toast.error(
        message.includes("EXPIRED")
          ? "Cette invitation a expiré."
          : message.includes("MISMATCH")
            ? "Cette invitation ne correspond pas à votre adresse email."
            : message.includes("INVALID")
              ? "Invitation invalide ou déjà utilisée."
              : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-deep px-6 py-12">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-card">
        <p className="font-display text-xl font-bold">Activer votre compte admin</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {email
            ? `Connecté en tant que ${email}.`
            : "Ouvrez ce lien depuis l'email d'invitation pour être identifié."}
        </p>

        <label className="mt-6 block text-xs font-semibold" htmlFor="new-password">
          Définir un mot de passe
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <button
          type="submit"
          disabled={busy || !email}
          className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Activation…" : "Accepter l'invitation"}
        </button>
      </form>
    </div>
  );
}
