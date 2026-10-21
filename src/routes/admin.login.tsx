import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { platformNeedsBootstrap } from "@/lib/admin/bootstrap.functions";

export const Route = createFileRoute("/admin/login")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Connexion administrateur — ZUKA PAY" },
      { name: "description", content: "Connexion sécurisée au back-office ZUKA PAY." },
      { property: "og:title", content: "Connexion administrateur — ZUKA PAY" },
      { property: "og:description", content: "Connexion sécurisée au back-office ZUKA PAY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const checkBootstrap = useServerFn(platformNeedsBootstrap);
  const { data: bootstrap } = useQuery({
    queryKey: ["platform-bootstrap"],
    queryFn: () => checkBootstrap(),
    retry: false,
  });

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error("Connexion impossible", { description: error.message });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["admin-session"] });
    void navigate({ to: "/admin", replace: true });
  }

  async function createOwner() {
    if (!email.trim() || password.length < 8) {
      toast.error("Saisissez un email et un mot de passe d'au moins 8 caractères.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      await queryClient.invalidateQueries({ queryKey: ["admin-session"] });
      void navigate({ to: "/admin", replace: true });
    } else {
      toast.success("Compte créé. Confirmez votre adresse email, puis connectez-vous.");
    }
  }


  async function resetPassword() {
    if (!email.trim()) {
      toast.error("Saisissez d'abord votre adresse email.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/invitation`,
    });
    if (error) toast.error(error.message);
    else toast.success("Email de réinitialisation envoyé.");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-deep px-6 py-12">
      <form
        onSubmit={signIn}
        className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-card"
        noValidate
      >
        <p className="font-display text-xl font-bold">ZUKA PAY Back-office</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Accès réservé aux administrateurs. Connexion par adresse email professionnelle.
        </p>

        <label className="mt-6 block text-xs font-semibold" htmlFor="admin-email">
          Adresse email
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <label className="mt-4 block text-xs font-semibold" htmlFor="admin-password">
          Mot de passe
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
        <button
          type="button"
          onClick={resetPassword}
          className="mt-3 w-full text-xs text-muted-foreground underline"
        >
          Mot de passe oublié / définir un mot de passe
        </button>

        {bootstrap?.needsBootstrap && (
          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-semibold">Première installation</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Aucun propriétaire n'existe encore. Créez le compte propriétaire avec votre adresse
              email professionnelle (mot de passe de 8 caractères minimum).
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={createOwner}
              className="mt-3 w-full rounded-xl border border-border bg-background py-2.5 text-xs font-semibold disabled:opacity-60"
            >
              Créer le compte propriétaire
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
