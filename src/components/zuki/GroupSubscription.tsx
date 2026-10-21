import { translateError } from "@/lib/i18n/errors";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CreditCard, Lock, Rocket } from "lucide-react";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import {
  getGroupSubscription,
  initiateSubscriptionPayment,
  launchTontine,
  setNextSubscriptionPayer,
  setSubscriptionConfig,
  type PayerMode,
} from "@/lib/tontines/subscription.functions";
import { getTransactionStatus } from "@/lib/payments/payments.functions";
import { downloadReceipt } from "@/lib/zuki/receipt";
import { cn } from "@/lib/utils";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });

export const subscriptionKey = (id: string) => ["group-subscription", id] as const;

export function useGroupSubscription(tontineId: string) {
  const fetchSub = useServerFn(getGroupSubscription);
  return useQuery({
    queryKey: subscriptionKey(tontineId),
    queryFn: () => fetchSub({ data: { tontineId } }),
    retry: false,
  });
}

function errText(e: unknown) {
  const code = e instanceof Error ? e.message : "";
  const map: Record<string, string> = {
    AUCUN_FOURNISSEUR: L("Aucun fournisseur Mobile Money actif pour le moment.", "No active Mobile Money provider yet.", "Hakuna mtoa huduma wa Mobile Money kwa sasa."),
    PAS_LE_PAYEUR: L("Vous n'êtes pas le payeur désigné.", "You are not the designated payer.", "Wewe si mlipaji aliyeteuliwa."),
    ROTATION_2_PAYEURS: L("Choisissez au moins 2 payeurs pour une rotation.", "Choose at least 2 payers for a rotation.", "Chagua walipaji angalau 2 kwa mzunguko."),
    CONFIG_ABONNEMENT_REQUISE: L("Configuration de l'abonnement requise avant le lancement du groupe.", "Subscription setup required before launching the group.", "Mipangilio ya usajili inahitajika kabla ya kuanza."),
    DEUXIEME_ADMIN_REQUIS: L("Choisissez un deuxième administrateur avant de lancer la tontine.", "Choose a second administrator before launching.", "Chagua msimamizi wa pili kabla ya kuanza."),
    NUMERO_INVALIDE: L("Numéro Mobile Money invalide.", "Invalid Mobile Money number.", "Namba ya Mobile Money si sahihi."),
    DEJA_PAYE: L("Cet abonnement est déjà payé.", "This subscription is already paid.", "Usajili huu umeshalipwa."),
  };
  return map[code] ?? translateError(e, ["Action impossible.", "Action failed.", "Imeshindwa."]);
}

export function GroupSubscription({ tontineId }: { tontineId: string }) {
  const { formatDate } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useGroupSubscription(tontineId);
  const saveConfig = useServerFn(setSubscriptionConfig);
  const saveNext = useServerFn(setNextSubscriptionPayer);
  const launch = useServerFn(launchTontine);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<PayerMode>("same");
  const [order, setOrder] = useState<string[]>([]);
  const [allowOthers, setAllowOthers] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(data.mode ?? "same");
    setOrder(data.order);
    setAllowOthers(data.allowOthers);
  }, [data]);

  if (isLoading || !data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: subscriptionKey(tontineId) });
  const nameOf = (id: string | null) => data.members.find((m) => m.id === id)?.name ?? "—";
  const modeLabel: Record<PayerMode, string> = {
    same: L("Même payeur", "Same payer", "Mlipaji yule yule"),
    rotate: L("Changement à chaque échéance", "Changes every due date", "Hubadilika kila tarehe"),
    custom: L("Tour personnalisé", "Custom order", "Mpangilio maalum"),
  };
  const statusLabel: Record<string, string> = {
    free: L("Gratuit", "Free", "Bure"),
    pending: L("À payer", "To pay", "Kulipwa"),
    overdue: L("En retard", "Overdue", "Imechelewa"),
    paid: L("Payé", "Paid", "Imelipwa"),
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
      return true;
    } catch (e) {
      toast.error(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setOrder((o) => (mode === "same" ? [id] : o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + d;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  const open = data.open;

  return (
    <section className="px-4 pt-4">
      {data.blocked && (
        <div className="mb-3 rounded-2xl bg-destructive p-4 text-destructive-foreground">
          <p className="flex items-center gap-2 text-sm font-bold uppercase">
            <Lock className="size-4" /> {L("Abonnement du groupe en retard", "Group subscription overdue", "Usajili wa kikundi umechelewa")}
          </p>
          <p className="mt-1 text-xs opacity-90">
            {data.canPay
              ? L("Abonnement du groupe non payé. Le groupe est bloqué jusqu'au paiement.", "Group subscription unpaid. The group is blocked until payment.", "Usajili haujalipwa. Kikundi kimefungwa hadi malipo.")
              : L(
                  "Abonnement du groupe en retard. Le groupe sera disponible dès que l'abonnement aura été payé par le membre désigné.",
                  "Group subscription overdue. The group will be available once the designated member pays the subscription.",
                  "Usajili wa kikundi umechelewa. Kikundi kitapatikana mara mwanachama aliyeteuliwa atakapolipa.",
                )}
          </p>
        </div>
      )}
      {!data.blocked && open && data.canPay && (
        <div className="mb-3 rounded-2xl bg-coral p-4 text-coral-foreground">
          <p className="text-sm font-bold">{L("Abonnement du groupe non payé", "Group subscription unpaid", "Usajili wa kikundi haujalipwa")}</p>
          <p className="text-xs opacity-90">
            {Number(open.price_locked)} {open.currency} · {L("échéance", "due", "tarehe")} {formatDate(open.due_date!)}
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{L("Abonnement du groupe", "Group subscription", "Usajili wa kikundi")}</p>
          {open && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", open.status === "overdue" ? "bg-destructive text-destructive-foreground" : "bg-muted")}>
              {statusLabel[open.status]}
            </span>
          )}
        </div>

        {!data.launched && (
          <div className="mt-3 rounded-xl bg-muted p-3 text-xs">
            <p className="font-semibold">{L("Tontine pas encore lancée", "Group not launched yet", "Kikundi bado hakijaanza")}</p>
            {!data.configured && (
              <p className="mt-1 text-destructive">
                {L(
                  "Configuration de l'abonnement requise avant le lancement du groupe. Veuillez définir le ou les payeurs ainsi que leur rythme de paiement.",
                  "Subscription setup required before launching the group. Please set the payer(s) and their payment rhythm.",
                  "Mipangilio ya usajili inahitajika kabla ya kuanza kikundi. Weka walipaji na mpangilio wao.",
                )}
              </p>
            )}
            {data.isAdmin && (
              <button
                disabled={!data.configured || busy}
                onClick={() => run(() => launch({ data: { tontineId } }), L("Tontine lancée.", "Group launched.", "Kikundi kimeanza."))}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-lagoon text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Rocket className="size-4" /> {L("Lancer la tontine", "Launch the group", "Anzisha kikundi")}
              </button>
            )}
          </div>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted-foreground">{L("Payeur actuel", "Current payer", "Mlipaji wa sasa")}</dt>
          <dd className="font-semibold">{nameOf(data.currentPayer)}</dd>
          <dt className="text-muted-foreground">{L("Prochain payeur", "Next payer", "Mlipaji ajaye")}</dt>
          <dd className="font-semibold">{nameOf(data.nextPayer)}</dd>
          <dt className="text-muted-foreground">{L("Payeur suivant", "Following payer", "Mlipaji anayefuata")}</dt>
          <dd className="font-semibold">{nameOf(data.followingPayer)}</dd>
          <dt className="text-muted-foreground">{L("Mode", "Mode", "Njia")}</dt>
          <dd className="font-semibold">{data.mode ? modeLabel[data.mode] : "—"}</dd>
          <dt className="text-muted-foreground">{L("Ordre des payeurs", "Payer order", "Mpangilio wa walipaji")}</dt>
          <dd className="font-semibold">{data.order.map(nameOf).join(" → ") || "—"}</dd>
          <dt className="text-muted-foreground">{L("Mois gratuit jusqu'au", "Free month until", "Mwezi wa bure hadi")}</dt>
          <dd className="font-semibold">{data.freeUntil ? formatDate(data.freeUntil) : "—"}</dd>
          <dt className="text-muted-foreground">{L("Prochaine échéance", "Next due date", "Tarehe ijayo")}</dt>
          <dd className="font-semibold">{formatDate(open?.due_date ?? data.nextDueDate)}</dd>
          {open && (
            <>
              <dt className="text-muted-foreground">{L("Montant", "Amount", "Kiasi")}</dt>
              <dd className="font-semibold">{Number(open.price_locked)} {open.currency}</dd>
            </>
          )}
        </dl>

        {open && data.canPay && (
          <button
            onClick={() => setPaying(true)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-coral text-sm font-bold text-coral-foreground"
          >
            <CreditCard className="size-4" /> {L("PAYER MAINTENANT", "PAY NOW", "LIPA SASA")}
          </button>
        )}

        {data.isAdmin && !editing && (
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditing(true)} className="h-10 flex-1 rounded-xl text-xs font-semibold ring-1 ring-line">
              {L("Modifier les payeurs", "Edit payers", "Badilisha walipaji")}
            </button>
            {data.launched && data.configured && (
              <select
                className="h-10 flex-1 rounded-xl bg-card px-2 text-xs ring-1 ring-line"
                value={data.nextPayerOverride ?? ""}
                onChange={(e) =>
                  run(
                    () => saveNext({ data: { tontineId, memberId: e.target.value || null } }),
                    L("Prochain payeur mis à jour.", "Next payer updated.", "Mlipaji ajaye amesasishwa."),
                  )
                }
              >
                <option value="">{L("Prochain : automatique", "Next: automatic", "Ajaye: otomatiki")}</option>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {data.isAdmin && editing && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <div className="grid gap-1">
              {(Object.keys(modeLabel) as PayerMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    if (m === "same") setOrder((o) => o.slice(0, 1));
                  }}
                  className={cn("h-9 rounded-lg px-3 text-left text-xs font-semibold ring-1 ring-line", mode === m ? "bg-lagoon text-primary-foreground" : "text-muted-foreground")}
                >
                  {modeLabel[m]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {mode === "same"
                ? L("Cochez le payeur.", "Tick the payer.", "Chagua mlipaji.")
                : L("Cochez les payeurs dans l'ordre de passage (au moins 2).", "Tick payers in order (at least 2).", "Chagua walipaji kwa mpangilio (angalau 2).")}
            </p>
            {data.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={order.includes(m.id)} onChange={() => toggle(m.id)} className="size-5 accent-[var(--color-lagoon)]" />
                <span className="flex-1">{m.name}{m.isMe ? ` (${L("moi", "me", "mimi")})` : ""}</span>
                {order.includes(m.id) && mode !== "same" && <span className="font-mono text-xs">#{order.indexOf(m.id) + 1}</span>}
              </label>
            ))}
            {mode !== "same" && order.length > 1 && (
              <ol className="space-y-1">
                {order.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">{i + 1}. {nameOf(id)}</span>
                    <button type="button" onClick={() => move(i, -1)} aria-label="up"><ArrowUp className="size-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} aria-label="down"><ArrowDown className="size-4" /></button>
                  </li>
                ))}
              </ol>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={allowOthers} onChange={(e) => setAllowOthers(e.target.checked)} className="size-4 accent-[var(--color-lagoon)]" />
              {L("Autoriser les autres membres à payer", "Allow other members to pay", "Ruhusu wanachama wengine kulipa")}
            </label>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="h-10 flex-1 rounded-xl text-xs ring-1 ring-line">
                {L("Annuler", "Cancel", "Ghairi")}
              </button>
              <button
                disabled={busy || !order.length || (mode !== "same" && order.length < 2)}
                onClick={async () => {
                  const ok = await run(
                    () => saveConfig({ data: { tontineId, mode, order, allowOthers } }),
                    L("Configuration enregistrée.", "Settings saved.", "Mipangilio imehifadhiwa."),
                  );
                  if (ok) setEditing(false);
                }}
                className="h-10 flex-[2] rounded-xl bg-lagoon text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {L("Enregistrer", "Save", "Hifadhi")}
              </button>
            </div>
          </div>
        )}

        {data.history.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-semibold">{L("Historique des abonnements", "Subscription history", "Historia ya usajili")}</p>
            <ul className="mt-2 divide-y divide-line">
              {data.history.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-xs">
                  <div className="flex-1">
                    <p className="font-semibold">
                      {formatDate(s.period_start)} → {formatDate(s.period_end)}
                    </p>
                    <p className="text-muted-foreground">
                      {Number(s.price_locked)} {s.currency} · {nameOf(s.payer_member_id)}
                      {s.transaction_ref ? ` · ${s.transaction_ref}` : ""}
                    </p>
                  </div>
                  <span className="font-semibold">{statusLabel[s.status] ?? s.status}</span>
                  {s.status === "paid" && s.transaction_ref && (
                    <button
                      className="rounded-lg px-2 py-1 ring-1 ring-line"
                      onClick={() =>
                        void downloadReceipt({
                          id: s.id,
                          reference: s.transaction_ref!,
                          createdAt: s.paid_at ?? s.created_at,
                          amount: Number(s.price_locked),
                          currency: s.currency,
                          status: "SUCCESS",
                          statusLabel: L("Réussie", "Successful", "Imefanikiwa"),
                          kind: L("Abonnement du groupe", "Group subscription", "Usajili wa kikundi"),
                          method: "Mobile Money",
                          payerName: nameOf(s.payer_member_id),
                          payerPhone: "",
                          beneficiaryName: "ZUKA PAY",
                          beneficiaryPhone: "",
                          groupName: s.group_name,
                          groupId: tontineId,
                          frequency: L("Mensuelle", "Monthly", "Kila mwezi"),
                          dueLabel: `${s.period_start} → ${s.period_end}`,
                          contributionAmount: Number(s.price_locked),
                          penaltyAmount: 0,
                          dueDate: s.due_date ?? undefined,
                          daysLate: 0,
                        })
                      }
                    >
                      {L("Reçu", "Receipt", "Risiti")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {paying && open && (
        <SubscriptionPaySheet
          subscriptionId={open.id}
          amount={Number(open.price_locked)}
          currency={open.currency}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            void refresh();
            void qc.invalidateQueries({ queryKey: ["my-subscription-dues"] });
          }}
        />
      )}
    </section>
  );
}

export function SubscriptionPaySheet({
  subscriptionId,
  amount,
  currency,
  onClose,
  onDone,
}: {
  subscriptionId: string;
  amount: number;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const initiate = useServerFn(initiateSubscriptionPayment);
  const status = useServerFn(getTransactionStatus);
  const [msisdn, setMsisdn] = useState("+243");
  const [state, setState] = useState<"form" | "waiting">("form");

  const pay = async () => {
    setState("waiting");
    try {
      const tx = await initiate({ data: { subscriptionId, msisdn, idempotencyKey: `sub-${subscriptionId}-${Date.now()}` } });
      const deadline = Date.now() + 120_000;
      let st = tx.status;
      while (!["SUCCESS", "FAILED", "CANCELLED", "EXPIRED"].includes(st) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        st = (await status({ data: { reference: tx.reference } })).status;
      }
      if (st === "SUCCESS") {
        toast.success(L("Abonnement payé. Le groupe est débloqué.", "Subscription paid. The group is unlocked.", "Usajili umelipwa. Kikundi kimefunguliwa."));
        onDone();
      } else {
        toast.error(
          st === "FAILED" || st === "CANCELLED" || st === "EXPIRED"
            ? L("Paiement non abouti.", "Payment failed.", "Malipo hayakufanikiwa.")
            : L("Paiement en attente de confirmation.", "Payment awaiting confirmation.", "Malipo yanasubiri uthibitisho."),
        );
        onClose();
      }
    } catch (e) {
      toast.error(errText(e));
      setState("form");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/40" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">{L("Payer l'abonnement du groupe", "Pay the group subscription", "Lipa usajili wa kikundi")}</p>
        <p className="mt-1 font-display text-3xl text-deep">{amount} {currency}</p>
        <label className="mt-4 block text-xs text-muted-foreground">
          {L("Numéro Mobile Money", "Mobile Money number", "Namba ya Mobile Money")}
          <input
            className="mt-1 h-12 w-full rounded-xl bg-card px-3 font-mono text-sm ring-1 ring-line outline-none"
            inputMode="tel"
            value={msisdn}
            onChange={(e) => setMsisdn(e.target.value.replace(/[^\d+]/g, ""))}
          />
        </label>
        <button
          disabled={state === "waiting"}
          onClick={pay}
          className="mt-4 h-14 w-full rounded-2xl bg-coral text-base font-bold text-coral-foreground disabled:opacity-60"
        >
          {state === "waiting"
            ? L("Confirmez sur votre téléphone…", "Confirm on your phone…", "Thibitisha kwenye simu yako…")
            : L("PAYER MAINTENANT", "PAY NOW", "LIPA SASA")}
        </button>
      </div>
    </div>
  );
}
