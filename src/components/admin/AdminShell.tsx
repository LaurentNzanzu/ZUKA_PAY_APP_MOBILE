import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Tags,
  Receipt,
  Wallet,
  ScrollText,
  ShieldCheck,
  LogOut,
  PiggyBank,
  MessageSquare,
  Bell,
  Settings,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSession } from "@/lib/admin/admin.functions";
import { can, type AdminSession } from "@/lib/admin/permissions";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ZukaLogo } from "@/components/zuki/ZukaLogo";

export function useAdminSession() {
  const fetchSession = useServerFn(getAdminSession);
  return useQuery<AdminSession>({
    queryKey: ["admin-session"],
    queryFn: () => fetchSession(),
    retry: false,
    staleTime: 30_000,
  });
}

const NAV = [
  { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard, permission: null },
  { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, permission: "users.view" },
  { to: "/admin/tontines", label: "Tontines", icon: PiggyBank, permission: "groups.view" },
  { to: "/admin/admins", label: "Administrateurs", icon: ShieldCheck, permission: "admins.view" },
  { to: "/admin/pricing", label: "Tarification", icon: Tags, permission: "pricing.view" },
  { to: "/admin/subscriptions", label: "Abonnements", icon: Wallet, permission: "payments.view" },
  { to: "/admin/providers", label: "Mobile Money", icon: Users, permission: "mobile_money.view" },
  { to: "/admin/sms", label: "Fournisseur SMS", icon: MessageSquare, permission: "settings.view" },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt, permission: "transactions.view" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, permission: "settings.view" },
  { to: "/admin/parametres", label: "Paramètres", icon: Settings, permission: "settings.view" },
  { to: "/admin/sante", label: "Santé du système", icon: Activity, permission: "settings.view" },
  { to: "/admin/audit", label: "Journal d'audit", icon: ScrollText, permission: "admins.view" },
] as const;

export function AdminShell({
  title,
  permission,
  children,
}: {
  title: string;
  permission?: string;
  children: ReactNode;
}) {
  const { data: session, isLoading, isError } = useAdminSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (isError) void navigate({ to: "/admin/login", replace: true });
  }, [isError, navigate]);

  if (isLoading || isError) {
    return (
      <div className="min-h-dvh bg-background p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  if (!session?.isAdmin || session.status !== "active") {
    return <AccessDenied session={session ?? null} />;
  }
  if (permission && !can(session, permission)) {
    return <AccessDenied session={session} missing={permission} />;
  }

  const items = NAV.filter((n) => !n.permission || can(session, n.permission));

  return (
    <div className="flex min-h-dvh bg-muted/40 text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-deep px-4 py-6 text-primary-foreground md:flex">
        <div className="px-2 pb-6">
          <div className="flex h-14 items-center">
            <ZukaLogo className="h-12 text-primary-foreground" />
          </div>
          <p className="mt-2 text-xs text-primary-foreground/60">Back-office</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => {
            const active = to === "/admin" ? pathname === "/admin" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary-foreground/15 font-semibold text-mint"
                    : "text-primary-foreground/75 hover:bg-primary-foreground/10",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-primary-foreground/10 pt-4 text-xs">
          <p className="truncate font-medium">{session.email}</p>
          <p className="text-primary-foreground/60">
            {session.isSuperAdmin ? "Super administrateur" : "Administrateur"}
          </p>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              void navigate({ to: "/admin/login", replace: true });
            }}
            className="mt-3 flex items-center gap-2 text-primary-foreground/70 hover:text-mint"
          >
            <LogOut className="size-3.5" /> Se déconnecter
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-6 py-4 backdrop-blur">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <div className="flex items-center gap-2 md:hidden">
            {items.map(({ to, label }) => (
              <Link key={to} to={to} className="rounded-lg bg-muted px-2 py-1 text-xs">
                {label}
              </Link>
            ))}
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

function AccessDenied({ session, missing }: { session: AdminSession | null; missing?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-card">
        <h1 className="font-display text-xl font-semibold">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session?.status === "suspended"
            ? "Votre compte administrateur est suspendu."
            : missing
              ? "Vous n'avez pas la permission nécessaire pour cette section."
              : "Cet espace est réservé aux administrateurs ZUKA PAY."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/" className="rounded-xl bg-muted px-4 py-2 text-sm font-medium">
            Retour à l'application
          </Link>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              void navigate({ to: "/admin/login", replace: true });
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Changer de compte
          </button>
        </div>
      </div>
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
