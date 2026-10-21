import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const TITLE = "Tontine en ligne en RDC : comment la gérer avec Mobile Money";
const DESCRIPTION =
  "Guide pratique de la tontine en ligne en RDC : organiser les cotisations, éviter les retards, suivre la cagnotte et encaisser par Mobile Money en toute transparence.";
const URL = "https://www.zukapay.cash/tontine-en-ligne-rdc";

export const Route = createFileRoute("/tontine-en-ligne-rdc")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: "fr",
          mainEntityOfPage: URL,
          author: { "@type": "Organization", name: "ZUKA PAY" },
          publisher: { "@type": "Organization", name: "ZUKA PAY" },
        }),
      },
    ],
  }),
  component: TontineGuide,
});

type Tri = { fr: string; en: string; sw: string };

const benefits: { icon: typeof ShieldCheck; title: Tri; text: Tri }[] = [
  {
    icon: ShieldCheck,
    title: { fr: "Transparence totale", en: "Full transparency", sw: "Uwazi kamili" },
    text: {
      fr: "Chaque cotisation est enregistrée avec sa date, son montant et son auteur. Personne ne peut contester un versement : le groupe voit la même information au même moment.",
      en: "Every contribution is recorded with its date, amount and payer. Nobody can dispute a payment: the whole group sees the same information at the same time.",
      sw: "Kila mchango unarekodiwa pamoja na tarehe, kiasi na aliyelipa. Hakuna anayeweza kupinga malipo: kikundi chote kinaona taarifa ileile kwa wakati mmoja.",
    },
  },
  {
    icon: Smartphone,
    title: { fr: "Paiement par Mobile Money", en: "Mobile Money payments", sw: "Malipo kwa Mobile Money" },
    text: {
      fr: "Les membres cotisent depuis Orange Money, Airtel Money, M-Pesa ou MTN MoMo. Aucun argent ne transite par un portefeuille ZUKA PAY : les fonds vont directement au bénéficiaire du tour.",
      en: "Members contribute from Orange Money, Airtel Money, M-Pesa or MTN MoMo. No money passes through a ZUKA PAY wallet: funds go straight to the turn's beneficiary.",
      sw: "Wanachama huchangia kupitia Orange Money, Airtel Money, M-Pesa au MTN MoMo. Hakuna pesa inayopita kwenye pochi ya ZUKA PAY: fedha huenda moja kwa moja kwa mnufaika wa zamu.",
    },
  },
  {
    icon: Users,
    title: { fr: "Des tours clairs et négociables", en: "Clear, negotiable turns", sw: "Zamu wazi zinazoweza kujadiliwa" },
    text: {
      fr: "L'ordre des bénéficiaires est fixé dès la création. Un membre pressé peut demander un échange de tour, validé par le groupe et tracé dans l'historique.",
      en: "The order of beneficiaries is set at creation. A member in a hurry can ask to swap turns, approved by the group and recorded in the history.",
      sw: "Mpangilio wa wanufaika huwekwa wakati wa kuunda kikundi. Mwanachama mwenye haraka anaweza kuomba kubadilishana zamu, ikiidhinishwa na kikundi na kurekodiwa kwenye historia.",
    },
  },
];

const steps: Tri[] = [
  {
    fr: "Créez le groupe : nom, montant de la cotisation, devise (CDF ou USD) et fréquence (journalière, hebdomadaire ou mensuelle).",
    en: "Create the group: name, contribution amount, currency (CDF or USD) and frequency (daily, weekly or monthly).",
    sw: "Unda kikundi: jina, kiasi cha mchango, sarafu (CDF au USD) na marudio (kila siku, kila wiki au kila mwezi).",
  },
  {
    fr: "Invitez les membres avec le lien personnalisé ou le QR Code du groupe.",
    en: "Invite members with the group's personal link or QR Code.",
    sw: "Alika wanachama kwa kiungo maalum au QR Code ya kikundi.",
  },
  {
    fr: "Vérifiez la simulation : ZUKA PAY affiche toutes les échéances et la date à laquelle chaque membre reçoit la cagnotte.",
    en: "Check the simulation: ZUKA PAY shows every due date and when each member receives the pot.",
    sw: "Kagua makadirio: ZUKA PAY inaonyesha tarehe zote za malipo na siku kila mwanachama atapokea mfuko.",
  },
  {
    fr: "Laissez l'application rappeler les échéances et suivre les retards, les paiements partiels et la cagnotte en temps réel.",
    en: "Let the app send due-date reminders and track late payments, partial payments and the pot in real time.",
    sw: "Acha programu ikumbushe tarehe za malipo na ifuatilie ucheleweshaji, malipo ya sehemu na mfuko kwa wakati halisi.",
  },
];

const T = {
  guide: { fr: "Guide ZUKA PAY", en: "ZUKA PAY guide", sw: "Mwongozo wa ZUKA PAY" },
  title: { fr: TITLE, en: "Online tontine in the DRC: how to run it with Mobile Money", sw: "Kikundi cha akiba mtandaoni DRC: jinsi ya kukiendesha kwa Mobile Money" },
  intro: {
    fr: "La tontine reste le moyen d'épargne le plus utilisé en République démocratique du Congo : familles, associations, commerçants de marché ou collègues mettent en commun une somme fixe et la remettent à tour de rôle à l'un des membres. Le problème n'est presque jamais la confiance de départ, mais le suivi : un cahier perdu, un retard oublié, un tour contesté, et le groupe se fissure. Gérer sa tontine en ligne résout exactement ce point.",
    en: "The tontine remains the most popular way to save in the Democratic Republic of the Congo: families, associations, market traders or colleagues pool a fixed amount and hand it to one member in turn. The problem is almost never the initial trust, but the follow-up: a lost notebook, a forgotten late payment, a disputed turn, and the group falls apart. Running your tontine online solves exactly that.",
    sw: "Kikundi cha akiba (tontine) bado ndiyo njia maarufu zaidi ya kuweka akiba katika Jamhuri ya Kidemokrasia ya Kongo: familia, vyama, wafanyabiashara wa sokoni au wafanyakazi wenzao huchanga kiasi maalum na kumpa mwanachama mmoja kwa zamu. Tatizo karibu kamwe si uaminifu wa mwanzo, bali ufuatiliaji: daftari lililopotea, kuchelewa kulikosahaulika, zamu inayopingwa, na kikundi kinavunjika. Kuendesha kikundi chako mtandaoni kunatatua hilo hasa.",
  },
  h1: { fr: "Qu'est-ce qu'une tontine en ligne ?", en: "What is an online tontine?", sw: "Kikundi cha akiba mtandaoni ni nini?" },
  p1: {
    fr: "Une tontine en ligne conserve le fonctionnement traditionnel — même montant, même rythme, même ordre de passage — mais remplace le cahier par une application partagée. Les cotisations sont envoyées par Mobile Money et enregistrées automatiquement, chaque membre consulte l'état du groupe depuis son téléphone, et les rappels partent tout seuls avant chaque échéance.",
    en: "An online tontine keeps the traditional way of working — same amount, same pace, same order — but replaces the notebook with a shared app. Contributions are sent by Mobile Money and recorded automatically, every member checks the group's status from their phone, and reminders go out on their own before each due date.",
    sw: "Kikundi cha akiba mtandaoni kinahifadhi utaratibu wa jadi — kiasi kilekile, mwendo uleule, mpangilio uleule — lakini kinabadilisha daftari kwa programu ya pamoja. Michango hutumwa kwa Mobile Money na kurekodiwa moja kwa moja, kila mwanachama huona hali ya kikundi kwenye simu yake, na vikumbusho hutumwa vyenyewe kabla ya kila tarehe ya malipo.",
  },
  h2: { fr: "Ce que la version numérique change vraiment", en: "What going digital really changes", sw: "Kile ambacho toleo la kidijitali hubadilisha kweli" },
  h3: { fr: "Lancer sa tontine en ligne en 4 étapes", en: "Start your online tontine in 4 steps", sw: "Anzisha kikundi chako mtandaoni kwa hatua 4" },
  h4: { fr: "Sécurité : où va l'argent ?", en: "Security: where does the money go?", sw: "Usalama: pesa huenda wapi?" },
  p4: {
    fr: "ZUKA PAY n'est pas une banque et ne conserve aucun solde. L'application organise, calcule et prouve ; les montants circulent uniquement entre les comptes Mobile Money des membres et du bénéficiaire du tour. Chaque paiement reçoit une référence unique et un reçu téléchargeable, utile en cas de désaccord.",
    en: "ZUKA PAY is not a bank and holds no balance. The app organises, calculates and proves; money only moves between the Mobile Money accounts of the members and the turn's beneficiary. Every payment gets a unique reference and a downloadable receipt, useful in case of disagreement.",
    sw: "ZUKA PAY si benki na haihifadhi salio lolote. Programu hupanga, hukokotoa na kuthibitisha; pesa husafiri tu kati ya akaunti za Mobile Money za wanachama na mnufaika wa zamu. Kila malipo hupata namba ya kipekee na risiti inayoweza kupakuliwa, muhimu ikitokea kutoelewana.",
  },
  faq: { fr: "Questions fréquentes", en: "Frequently asked questions", sw: "Maswali yanayoulizwa mara kwa mara" },
  q1: { fr: "Peut-on cotiser en dollars et en francs congolais ?", en: "Can we contribute in dollars and Congolese francs?", sw: "Je, tunaweza kuchangia kwa dola na faranga za Kongo?" },
  a1: { fr: "Oui. Chaque groupe choisit sa devise, CDF ou USD, et tous les calculs suivent ce choix.", en: "Yes. Each group chooses its currency, CDF or USD, and all calculations follow that choice.", sw: "Ndiyo. Kila kikundi huchagua sarafu yake, CDF au USD, na hesabu zote hufuata chaguo hilo." },
  q2: { fr: "Que se passe-t-il si un membre paie en retard ou partiellement ?", en: "What happens if a member pays late or partially?", sw: "Nini hutokea mwanachama akilipa kwa kuchelewa au sehemu tu?" },
  a2: { fr: "Le paiement partiel est accepté et le solde restant reste visible pour tout le groupe, avec des rappels jusqu'au règlement complet.", en: "Partial payment is accepted and the remaining balance stays visible to the whole group, with reminders until it is fully paid.", sw: "Malipo ya sehemu yanakubaliwa na kiasi kilichobaki kinaonekana kwa kikundi chote, pamoja na vikumbusho hadi kilipwe kikamilifu." },
  q3: { fr: "Faut-il un smartphone récent ?", en: "Do you need a recent smartphone?", sw: "Je, unahitaji simu janja mpya?" },
  a3: { fr: "Non. L'application est conçue pour les connexions lentes et fonctionne sur les téléphones d'entrée de gamme comme depuis un ordinateur.", en: "No. The app is built for slow connections and works on entry-level phones as well as on a computer.", sw: "Hapana. Programu imeundwa kwa mitandao ya polepole na inafanya kazi kwenye simu za bei nafuu pamoja na kompyuta." },
  ready: { fr: "Prêt à organiser votre tontine ?", en: "Ready to organise your tontine?", sw: "Uko tayari kupanga kikundi chako?" },
  readyText: { fr: "Créez votre groupe en quelques minutes et invitez vos membres par lien ou QR Code.", en: "Create your group in a few minutes and invite your members by link or QR Code.", sw: "Unda kikundi chako kwa dakika chache na uwaalike wanachama kwa kiungo au QR Code." },
  create: { fr: "Créer ma tontine", en: "Create my tontine", sw: "Unda kikundi changu" },
  back: { fr: "Retour à l'accueil ZUKA PAY", en: "Back to ZUKA PAY home", sw: "Rudi mwanzo wa ZUKA PAY" },
} satisfies Record<string, Tri>;

function TontineGuide() {
  const { L } = useI18n();
  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-3xl bg-background px-5 py-10 text-foreground">
      <article>
        <p className="font-display text-sm font-bold text-primary">{L(T.guide)}</p>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">{L(T.title)}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{L(T.intro)}</p>

        <h2 className="mt-10 font-display text-2xl font-semibold">{L(T.h1)}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{L(T.p1)}</p>

        <h2 className="mt-10 font-display text-2xl font-semibold">{L(T.h2)}</h2>
        <div className="mt-4 grid gap-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <section key={title.fr} className="rounded-2xl bg-card p-5 ring-1 ring-line">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lagoon/15 text-deep">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-display text-lg font-semibold">{L(title)}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{L(text)}</p>
            </section>
          ))}
        </div>

        <h2 className="mt-10 font-display text-2xl font-semibold">{L(T.h3)}</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={step.fr} className="flex gap-3 text-base leading-7 text-muted-foreground">
              <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-emerald text-xs font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span>{L(step)}</span>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 font-display text-2xl font-semibold">{L(T.h4)}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{L(T.p4)}</p>

        <h2 className="mt-10 font-display text-2xl font-semibold">{L(T.faq)}</h2>
        <dl className="mt-4 space-y-4">
          {([[T.q1, T.a1], [T.q2, T.a2], [T.q3, T.a3]] as const).map(([q, a]) => (
            <div key={q.fr}>
              <dt className="font-semibold">{L(q)}</dt>
              <dd className="mt-1 text-sm leading-6 text-muted-foreground">{L(a)}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 rounded-2xl bg-card p-6 text-center ring-1 ring-line">
          <p className="flex items-center justify-center gap-2 font-display text-lg font-semibold">
            <CheckCircle2 className="size-5 text-lagoon" aria-hidden="true" />
            {L(T.ready)}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{L(T.readyText)}</p>
          <Link
            to="/groupes/nouveau"
            className="pressable mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            {L(T.create)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link to="/" className="underline underline-offset-2">
              {L(T.back)}
            </Link>
          </p>
        </div>
      </article>
    </main>
  );
}
