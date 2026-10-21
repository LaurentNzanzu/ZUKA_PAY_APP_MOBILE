import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, HandCoins } from "lucide-react";
import { currentLang, pick, useI18n } from "@/lib/i18n";
import {
  CO_ADMIN_PERMISSIONS,
  MAX_INTEREST,
  getGroupDisputes,
  payProxyRequest,
  requestProxyPayment,
  resolveProxyRequest,
  setSecondAdmin,
  transferGroupManagement,
} from "@/lib/tontines/disputes.functions";
import { PayFlowSheet, errMsg } from "./PayFlowSheet";

const L = (fr: string, en: string, sw: string) => pick(currentLang(), { fr, en, sw });
const PERM: Record<string, [string, string, string]> = {
  members: ["Gérer les membres", "Manage members", "Simamia wanachama"],
  approve_proxy: ["Approuver les paiements pour autrui", "Approve payments for others", "Idhinisha malipo kwa niaba ya wengine"],
  invitations: ["Gérer les invitations", "Manage invitations", "Simamia mialiko"],
  contributions: ["Gérer les cotisations", "Manage contributions", "Simamia michango"],
  late: ["Gérer les retards", "Manage late payments", "Simamia ucheleweshaji"],
  transactions: ["Consulter les transactions", "View transactions", "Tazama miamala"],
  notifications: ["Gérer les notifications", "Manage notifications", "Simamia arifa"],
  settings: ["Gérer les paramètres", "Manage settings", "Simamia mipangilio"],
  beneficiaries: ["Gérer les bénéficiaires", "Manage beneficiaries", "Simamia wanufaika"],
  reimbursements: ["Gérer les remboursements", "Manage reimbursements", "Simamia marejesho"],
};
const permLabel = (p: string) => (PERM[p] ? L(...PERM[p]) : p);

export function GroupGovernance({ tontineId }: { tontineId: string }) {
  const { formatDate } = useI18n();
  const qc = useQueryClient();
  const key = ["group-disputes", tontineId];
  const fetch = useServerFn(getGroupDisputes);
  const ask = useServerFn(requestProxyPayment);
  const resolve = useServerFn(resolveProxyRequest);
  const payProxy = useServerFn(payProxyRequest);
  const setSecond = useServerFn(setSecondAdmin);
  const transfer = useServerFn(transferGroupManagement);
  const { data } = useQuery({ queryKey: key, queryFn: () => fetch({ data: { tontineId } }), retry: false });
  const [paying, setPaying] = useState<{ id: string; amount: number; currency: string; penalty: number } | null>(null);
  const [reimb, setReimb] = useState(false);
  const [withInterest, setWithInterest] = useState(false);
  const [rate, setRate] = useState("0");
  const [secondId, setSecondId] = useState("");
  const [perms, setPerms] = useState<string[]>(["approve_proxy"]);
  if (!data) return null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["my-disputes"] });
  };
  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const isPrincipal = data.me.role === "admin";
  const canApprove = isPrincipal || (data.me.role === "co_admin" && data.me.permissions.includes("approve_proxy"));
  const rateNum = Number(rate.replace(",", "."));
  const rateInvalid = withInterest && (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > MAX_INTEREST);
  const effRate = reimb && withInterest && !rateInvalid ? rateNum : 0;
  const interest = paying ? Math.round(paying.amount * effRate) / 100 : 0;
  const requested = new Set(data.requests.filter((r: any) => ["pending", "approved"].includes(r.status)).map((r: any) => r.debtorName + r.dueDate));

  return (
    <section className="mx-4 mt-4 space-y-3 rounded-3xl bg-card p-4 ring-1 ring-line">
      <p className="flex items-center gap-2 text-sm font-bold">
        <ShieldCheck className="size-4" /> {L("Administration et paiements pour autrui", "Administration & paying for others", "Usimamizi na kulipia wengine")}
      </p>

      {isPrincipal && (
        <div className="rounded-2xl bg-background p-3 text-sm">
          <p className="font-semibold">{L("Deuxième administrateur", "Second administrator", "Msimamizi wa pili")}</p>
          {data.needsSecondAdmin && (
            <p className="mt-1 text-xs text-destructive">
              {L("Obligatoire : choisissez un deuxième administrateur parmi les membres.", "Required: choose a second admin among members.", "Lazima: chagua msimamizi wa pili.")}
            </p>
          )}
          {data.secondAdmin && (
            <p className="mt-1 text-xs text-muted-foreground">
              {data.secondAdmin.name} · {data.secondAdmin.permissions.map((p) => permLabel(p)).join(", ") || "—"}
            </p>
          )}
          <select value={secondId} onChange={(e) => setSecondId(e.target.value)} className="mt-2 h-10 w-full rounded-xl bg-card px-2 text-sm ring-1 ring-line">
            <option value="">{L("Choisir un membre…", "Choose a member…", "Chagua mwanachama…")}</option>
            {data.members.filter((m: any) => m.role !== "admin").map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-1 gap-1">
            {CO_ADMIN_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} />
                {permLabel(p)}
              </label>
            ))}
          </div>
          <button
            disabled={!secondId}
            onClick={() => run(setSecond({ data: { tontineId, memberId: secondId, permissions: perms } }), L("Deuxième administrateur enregistré.", "Second admin saved.", "Imehifadhiwa."))}
            className="mt-2 h-10 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {L("Enregistrer", "Save", "Hifadhi")}
          </button>
          {data.secondAdmin && (
            <button
              onClick={() => {
                if (confirm(L("Transmettre toute la gestion du groupe au deuxième administrateur ?", "Hand over group management to the second admin?", "Kukabidhi usimamizi?")))
                  void run(transfer({ data: { tontineId } }), L("Gestion transmise.", "Management transferred.", "Imekabidhiwa."));
              }}
              className="mt-2 h-10 w-full rounded-xl text-sm font-semibold text-destructive ring-1 ring-destructive"
            >
              {L("TRANSMETTRE LA GESTION DU GROUPE", "TRANSFER GROUP MANAGEMENT", "KABIDHI USIMAMIZI")}
            </button>
          )}
        </div>
      )}

      {data.late.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L("Membres en retard (jour-J dépassé)", "Late members (past due)", "Waliochelewa")}</p>
          {data.late.map((l) => (
            <div key={l.kind + l.id} className="flex items-center justify-between gap-2 rounded-xl bg-background p-3 text-xs">
              <span>
                {l.memberName} · {l.kind === "subscription" ? L("abonnement", "subscription", "usajili") : L("cotisation", "contribution", "mchango")} · {l.amount} · {formatDate(l.dueDate)}
              </span>
              {!requested.has(l.memberName + l.dueDate) && (
                <button
                  onClick={() => run(ask({ data: { tontineId, kind: l.kind, targetId: l.id } }), L("Demande envoyée à l'administrateur.", "Request sent to the admin.", "Ombi limetumwa."))}
                  className="shrink-0 rounded-lg bg-primary px-2 py-1.5 font-semibold text-primary-foreground"
                >
                  {L("DEMANDER À PAYER POUR CE MEMBRE", "ASK TO PAY FOR THIS MEMBER", "OMBA KULIPIA")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {data.requests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L("Demandes de paiement pour autrui", "Pay-for-others requests", "Maombi")}</p>
          {data.requests.map((r: any) => (
            <div key={r.id} className="rounded-xl bg-background p-3 text-xs">
              <p>
                <HandCoins className="mr-1 inline size-3" />
                {r.payerName} → {r.debtorName} · {r.amount} {r.currency} · <b>{r.status}</b>
              </p>
              {r.approvalRef && <p className="font-mono text-muted-foreground">{r.approvalRef}</p>}
              {r.status === "pending" && canApprove && !r.mine && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => run(resolve({ data: { requestId: r.id, approve: true } }), "OK")} className="flex-1 rounded-lg bg-primary py-1.5 font-semibold text-primary-foreground">
                    {L("APPROUVER", "APPROVE", "IDHINISHA")}
                  </button>
                  <button onClick={() => run(resolve({ data: { requestId: r.id, approve: false } }), "OK")} className="flex-1 rounded-lg py-1.5 font-semibold text-destructive ring-1 ring-destructive">
                    {L("REFUSER", "REFUSE", "KATAA")}
                  </button>
                </div>
              )}
              {r.status === "approved" && r.mine && (
                <button
                  onClick={() => setPaying({ id: r.id, amount: r.amount, currency: r.currency, penalty: r.debtorPenalty })}
                  className="mt-2 w-full rounded-lg bg-coral py-2 font-bold text-coral-foreground"
                >
                  {L("PAYER POUR CE MEMBRE", "PAY FOR THIS MEMBER", "LIPIA MWANACHAMA")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {data.changes.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary>{L("Historique des administrateurs", "Admin history", "Historia")}</summary>
          {data.changes.map((c: any) => (
            <p key={c.id} className="mt-1">
              {formatDate(String(c.at).slice(0, 10))} · {c.reason} · {c.oldPrincipal} → {c.newPrincipal}
              {c.newSecond !== "—" ? ` · 2e : ${c.newSecond}` : ""}
            </p>
          ))}
        </details>
      )}

      {paying && (
        <PayFlowSheet
          title={L("PAIEMENT EFFECTUÉ POUR UN AUTRE MEMBRE", "PAYMENT FOR ANOTHER MEMBER", "MALIPO KWA MWINGINE")}
          amount={paying.amount}
          currency={paying.currency}
          start={(msisdn, k) => {
            if (rateInvalid) return Promise.reject(new Error("TAUX_INTERET_MAX_8"));
            return payProxy({ data: { requestId: paying.id, msisdn, reimbursement: reimb, interestRate: effRate, idempotencyKey: k } });
          }}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            refresh();
          }}
        >
          {paying.penalty > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {L("La pénalité de retard", "The late penalty", "Adhabu")} ({paying.penalty} {paying.currency}) {L("reste à la charge du membre en retard.", "stays with the late member.", "inabaki kwa aliyechelewa.")}
            </p>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reimb} onChange={(e) => setReimb(e.target.checked)} />
            {L("JE RÉCLAME LE REMBOURSEMENT DE MON AVANCE", "I CLAIM REPAYMENT OF MY ADVANCE", "NADAI KURUDISHIWA")}
          </label>
          {reimb && (
            <div className="mt-2 space-y-2 rounded-xl bg-card p-3 text-sm">
              <div className="flex gap-4">
                <label className="flex items-center gap-1"><input type="radio" checked={!withInterest} onChange={() => setWithInterest(false)} /> {L("SANS INTÉRÊT", "NO INTEREST", "BILA RIBA")}</label>
                <label className="flex items-center gap-1"><input type="radio" checked={withInterest} onChange={() => setWithInterest(true)} /> {L("AVEC INTÉRÊT", "WITH INTEREST", "NA RIBA")}</label>
              </div>
              {withInterest && (
                <input
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
                  className="h-10 w-full rounded-lg bg-background px-2 font-mono ring-1 ring-line"
                  aria-label="%"
                />
              )}
              {rateInvalid && <p className="text-xs text-destructive">{L("Taux maximum : 8 %.", "Maximum rate: 8%.", "Kiwango cha juu: 8%.")}</p>}
              <p className="text-xs">
                {paying.amount} + {interest} ({effRate} %) = <b>{Math.round((paying.amount + interest) * 100) / 100} {paying.currency}</b>
              </p>
            </div>
          )}
        </PayFlowSheet>
      )}
    </section>
  );
}
