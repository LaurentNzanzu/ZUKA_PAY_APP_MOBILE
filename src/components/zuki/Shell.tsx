import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Users, Plus, Wallet, UserPlus, History, User, Bell } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useZuki } from "@/lib/zuki/store";
import { cn } from "@/lib/utils";
import { SectionEye } from "@/components/zuki/Money";
import { ZukaLogo } from "@/components/zuki/ZukaLogo";

const tabs = [
  { to: "/", icon: Home, key: "nav.home" },
  { to: "/groupes", icon: Users, key: "nav.groups" },
  { to: "/tours", icon: Wallet, key: "nav.contrib" },
  { to: "/groupes/nouveau", icon: Plus, key: "nav.create", raised: true },
  { to: "/inviter", icon: UserPlus, key: "qa.invite" },
  { to: "/historique", icon: History, key: "qa.history" },
  { to: "/profil", icon: User, key: "nav.profile" },
] as const;

export function Shell({
  children,
  notifications = 0,
  dark = false,
}: {
  children: ReactNode;
  notifications?: number;
  dark?: boolean;
}) {
  const { t } = useI18n();
  const { me } = useZuki();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = me.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-background pb-28 text-foreground">
      <header
        className={cn(
          "safe-top sticky top-0 z-30 flex items-center justify-between px-4 pb-3 backdrop-blur",
          "bg-background/90",
        )}
      >
        <Link
          to="/"
          className="pressable flex h-12 shrink-0 items-center"
          aria-label="ZUKA PAY — Accueil"
        >
          <ZukaLogo className="h-10 sm:h-11" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/profil"
            className={cn(
              "pressable flex items-center gap-2 rounded-full py-1 pl-1 pr-3",
              "bg-card ring-1 ring-line",
            )}
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[11px] font-bold",
                "bg-lagoon/15 text-deep",
              )}
            >
              {initials}
            </span>
            <span className="max-w-20 truncate text-xs font-semibold">{me.name.split(" ")[0]}</span>
          </Link>
          <span
            className={cn(
              "pressable relative grid size-9 shrink-0 place-items-center rounded-full",
              "bg-card ring-1 ring-line",
            )}
          >
            <Bell className={cn("size-4", "text-deep")} />
            {notifications > 0 && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warn ring-2 ring-background" />
            )}
          </span>
        </div>
      </header>

      {children}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-[430px] grid-cols-7 items-end bg-card/95 px-1 pt-1 ring-1 ring-line backdrop-blur">
        {tabs.map(({ to, icon: Icon, key, ...rest }) => {
          const raised = "raised" in rest && rest.raised;
          const active =
            to === "/" ? pathname === "/" : to === "/groupes" ? pathname === "/groupes" : pathname.startsWith(to);
          if (raised) {
            return (
              <Link key={to} to={to} aria-label={t(key)} className="pressable flex flex-col items-center gap-1 pb-2">
                <span className="grid size-12 -translate-y-3 ring-4 ring-background place-items-center rounded-2xl bg-gradient-emerald text-primary-foreground shadow-card">
                  <Icon className="size-6" />
                </span>
                <span className="-mt-2 text-[10px] font-semibold text-deep">{t(key)}</span>
              </Link>
            );
          }
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "pressable relative flex min-w-0 flex-col items-center gap-1 py-3",
                active ? "text-lagoon" : "text-muted-foreground",
              )}
            >
              {active && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-lagoon" />}
              <Icon className="size-5" />
              <span className={cn("w-full truncate text-center text-[9.5px] leading-tight", active ? "font-semibold" : "font-medium")}>{t(key)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function SectionTitle({ title, hint, eye }: { title: string; hint?: ReactNode; eye?: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="min-w-0 truncate font-display text-[15px] font-semibold">{title}</h2>
      {(hint || eye) && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
          {hint}
          {eye && <SectionEye className="-my-2 text-foreground" />}
        </span>
      )}
    </div>
  );
}
