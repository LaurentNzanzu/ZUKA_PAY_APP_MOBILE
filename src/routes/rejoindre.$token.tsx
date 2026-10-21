import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarDays, Clock, Coins, Hourglass, Users } from "lucide-react";
import { ZukaLogo } from "@/components/zuki/ZukaLogo";
import { supabase } from "@/integrations/supabase/client";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import { translateError } from "@/lib/i18n/errors";
import { formatMoney } from "@/lib/zuki/engine";
import { isNativeApp } from "@/lib/native/platform";
import { getInvitePreview, getMyInviteStatus, requestToJoin } from "@/lib/tontines/invites.functions";
import { clearPendingInvite, savePendingInvite } from "@/lib/tontines/pendingInvite";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });

const previewQuery = (token: string) =>
  queryOptions({ queryKey: ["invite-preview", token], queryFn: () => getInvitePreview({ data: { token } }) });

export const Route = createFileRoute("/rejoindre/$token")({
  staticData: { sitemap: false },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(previewQuery(params.token)),
  head: ({ loaderData }) => {
    const name = loaderData?.group?.name;
    const title = name ? `Rejoindre « ${name} » — ZUKA PAY` : "Invitation — ZUKA PAY";
    const desc = name
      ? `Vous êtes invité(e) à demander à rejoindre la tontine « ${name} » sur ZUKA PAY.`
      : "Invitation à rejoindre une tontine sur ZUKA PAY.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <Box>{L("Impossible de charger l'invitation. Réessayez plus tard.", "Could not load the invitation. Try again later.", "Imeshindwa kupakia mwaliko. Jaribu tena baadaye.")}</Box>,
  notFoundComponent: () => <Box>{L("Invitation introuvable.", "Invitation not found.", "Mwaliko haujapatikana.")}</Box>,
  component: JoinPage,
});

function Box({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <ZukaLogo className="size-14" />
      <div className="text-sm text-muted-foreground">{children}</div>
      <Link to="/" className="text-sm font-semibold text-lagoon">
        ZUKA PAY
      </Link>
    </main>
  );
}

const stateMsg = (k: string) =>
  ({
    invalid: L("Ce lien d'invitation n'est pas valide.", "This invitation link is not valid.", "Kiungo hiki cha mwaliko si sahihi."),
    revoked: L("Ce lien d'invitation a été désactivé par l'administrateur.", "This invitation link was disabled by the administrator.", "Kiungo hiki cha mwaliko kimezimwa na msimamizi."),
    expired: L("Ce lien d'invitation a expiré.", "This invitation link has expired.", "Kiungo hiki cha mwaliko kimeisha muda."),
    closed: L("Ce groupe est fermé et n'accepte plus de membres.", "This group is closed and no longer accepts members.", "Kikundi hiki kimefungwa na hakipokei wanachama tena."),
    full: L("Ce groupe a atteint son nombre maximum de membres.", "This group has reached its maximum number of members.", "Kikundi hiki kimefikia idadi ya juu ya wanachama."),
  })[k] ?? L("Ce lien d'invitation n'est pas valide.", "This invitation link is not valid.", "Kiungo hiki cha mwaliko si sahihi.");

function JoinPage() {
  const { token } = Route.useParams();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(previewQuery(token));
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const fetchStatus = useServerFn(getMyInviteStatus);
  const ask = useServerFn(requestToJoin);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: s }) => setSignedIn(Boolean(s.session)));
  }, []);

  // Signed-out visitor: keep the invite, and on phones send to the store when configured.
  useEffect(() => {
    if (signedIn !== false || data.state !== "ok") return;
    savePendingInvite(token);
    if (isNativeApp()) return;
    const ua = navigator.userAgent;
    const url = /android/i.test(ua) ? data.stores.android : /iphone|ipad|ipod/i.test(ua) ? data.stores.ios : null;
    const flag = `zuka.storeRedirect.${token}`;
    if (url && !sessionStorage.getItem(flag)) {
      sessionStorage.setItem(flag, "1");
      window.location.href = url;
    }
  }, [signedIn, data, token]);

  const status = useQuery({
    queryKey: ["invite-status", token],
    queryFn: () => fetchStatus({ data: { token } }),
    enabled: signedIn === true && data.state !== "invalid",
  });

  useEffect(() => {
    if (status.data?.relation === "member" && status.data.groupId) {
      clearPendingInvite();
      void navigate({ to: "/groupes/$groupId", params: { groupId: status.data.groupId }, replace: true });
    }
  }, [status.data, navigate]);

  if (!data.group) return <Box>{stateMsg(data.state)}</Box>;
  const g = data.group;
  const relation = status.data?.relation;

  async function join() {
    setBusy(true);
    try {
      await ask({ data: { token } });
      clearPendingInvite();
      toast.success(L("Demande envoyée à l'administrateur", "Request sent to the administrator", "Ombi limetumwa kwa msimamizi"));
      await qc.invalidateQueries({ queryKey: ["invite-status", token] });
    } catch (e) {
      toast.error(translateError(e, ["Envoi impossible. Réessayez.", "Could not send. Try again.", "Imeshindwa kutuma. Jaribu tena."]));
      await qc.invalidateQueries({ queryKey: ["invite-status", token] });
    } finally {
      setBusy(false);
    }
  }

  const facts = [
    { icon: Coins, label: L("Cotisation", "Contribution", "Mchango"), value: formatMoney(g.amount, g.currency as never) },
    { icon: Clock, label: L("Fréquence", "Frequency", "Marudio"), value: t(`freq.${g.frequency}` as "freq.monthly") },
    { icon: Users, label: L("Membres", "Members", "Wanachama"), value: `${g.members}/${g.maxMembers}` },
    { icon: Hourglass, label: L("Échéances", "Due dates", "Tarehe za malipo"), value: String(g.totalDues) },
    { icon: CalendarDays, label: L("Début", "Start", "Mwanzo"), value: formatDate(g.startDate) },
  ];

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md bg-background pb-10">
      <section className="relative overflow-hidden bg-gradient-lagoon px-5 pb-8 pt-6">
        <div className="absolute inset-0 bg-stripes opacity-30" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary-foreground/80">
            <ZukaLogo className="size-7 text-primary-foreground" />
            <span className="text-xs font-bold tracking-widest">ZUKA PAY · INVITATION</span>
          </div>
          {g.photoUrl && <img src={g.photoUrl} alt="" className="mt-4 size-16 rounded-2xl object-cover" />}
          <h1 className="mt-4 break-words font-display text-[34px] font-bold leading-tight text-primary-foreground">{g.name}</h1>
          {g.description && <p className="mt-2 text-sm text-primary-foreground/80">{g.description}</p>}
        </div>
      </section>

      {data.state !== "ok" && (
        <p className="mx-4 mt-4 rounded-2xl bg-warn/15 p-3 text-sm font-semibold text-warn">{stateMsg(data.state)}</p>
      )}

      <section className="mx-4 mt-4 grid grid-cols-2 gap-2">
        {facts.map((f) => (
          <div key={f.label} className="rounded-2xl bg-card p-3 ring-1 ring-line">
            <f.icon className="size-4 text-lagoon" />
            <p className="mt-1 text-[10px] text-muted-foreground">{f.label}</p>
            <p className="font-display text-base text-deep">{f.value}</p>
          </div>
        ))}
      </section>

      <section className="mx-4 mt-4 rounded-2xl bg-card p-4 text-[13px] ring-1 ring-line">
        <p className="mb-2 font-semibold">{L("Règles importantes", "Important rules", "Kanuni muhimu")}</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{L("Paiements uniquement par Mobile Money.", "Payments by Mobile Money only.", "Malipo kwa Mobile Money pekee.")}</li>
          <li>{g.partialPayments ? L("Paiements partiels autorisés.", "Partial payments allowed.", "Malipo ya sehemu yanaruhusiwa.") : L("Paiements partiels non autorisés.", "Partial payments not allowed.", "Malipo ya sehemu hayaruhusiwi.")}</li>
          <li>{g.latePenalty > 0 ? `${L("Pénalité de retard", "Late penalty", "Adhabu ya kuchelewa")}: ${formatMoney(g.latePenalty, g.currency as never)} ${L("par échéance", "per due date", "kwa kila tarehe ya malipo")}.` : L("Pas de pénalité de retard.", "No late penalty.", "Hakuna adhabu ya kuchelewa.")}</li>
          <li>{L("Votre adhésion doit être validée par l'administrateur.", "Your membership must be approved by the administrator.", "Uanachama wako lazima uidhinishwe na msimamizi.")}</li>
        </ul>
      </section>

      {data.state === "ok" && (
        <section className="mx-4 mt-6">
          {signedIn === false && (
            <Link
              to="/connexion"
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-coral text-base font-semibold text-coral-foreground"
            >
              {L("Se connecter pour demander à joindre", "Sign in to request to join", "Ingia ili uombe kujiunga")}
            </Link>
          )}
          {signedIn && relation === "none" && (
            <button
              onClick={join}
              disabled={busy}
              className="h-14 w-full rounded-2xl bg-coral text-base font-bold text-coral-foreground disabled:opacity-60"
            >
              {L("DEMANDER À JOINDRE LE GROUPE", "REQUEST TO JOIN THE GROUP", "OMBA KUJIUNGA NA KIKUNDI")}
            </button>
          )}
          {signedIn && relation === "pending" && (
            <p className="flex h-14 w-full items-center justify-center rounded-2xl bg-warn/15 font-bold text-warn">{L("DEMANDE EN ATTENTE", "REQUEST PENDING", "OMBI LINASUBIRI")}</p>
          )}
          {signedIn && relation === "refused" && (
            <div className="space-y-2">
              <p className="text-center text-sm text-muted-foreground">{L("Votre précédente demande n'a pas été acceptée.", "Your previous request was not accepted.", "Ombi lako la awali halikukubaliwa.")}</p>
              <button onClick={join} disabled={busy} className="h-12 w-full rounded-2xl bg-lagoon/10 text-sm font-semibold text-lagoon">
                {L("Envoyer une nouvelle demande", "Send a new request", "Tuma ombi jipya")}
              </button>
            </div>
          )}
          {(signedIn === null || (signedIn && status.isLoading)) && <div className="h-14 animate-pulse rounded-2xl bg-card" />}
        </section>
      )}
    </main>
  );
}
