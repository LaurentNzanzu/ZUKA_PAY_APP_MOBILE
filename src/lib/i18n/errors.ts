import { currentLang, pick } from "@/lib/i18n";

type T = [string, string, string];

/** Single translation table for every error code the server can send to users. */
const CODES: Record<string, T> = {
  ABONNEMENT_EN_RETARD: ["Abonnement du groupe en retard.", "Group subscription overdue.", "Usajili wa kikundi umechelewa."],
  ABONNEMENT_INTROUVABLE: ["Abonnement introuvable.", "Subscription not found.", "Usajili haujapatikana."],
  APPROBATION_REQUISE: ["L'administrateur doit d'abord approuver.", "The admin must approve first.", "Msimamizi lazima aidhinishe kwanza."],
  AUCUN_FOURNISSEUR: ["Aucun fournisseur Mobile Money actif. Contactez l'administrateur.", "No active Mobile Money provider. Contact the administrator.", "Hakuna mtoa huduma wa Mobile Money aliye hai. Wasiliana na msimamizi."],
  CONFIG_ABONNEMENT_REQUISE: ["Configuration de l'abonnement requise avant le lancement du groupe.", "Subscription setup required before launching the group.", "Mipangilio ya usajili inahitajika kabla ya kuanza."],
  COTISATION_INTROUVABLE: ["Cotisation introuvable.", "Contribution not found.", "Mchango haujapatikana."],
  DEJA_MEMBRE: ["Vous êtes déjà membre de ce groupe.", "You are already a member of this group.", "Tayari wewe ni mwanachama wa kikundi hiki."],
  DEJA_PAYE: ["Déjà payé.", "Already paid.", "Tayari imelipwa."],
  DEJA_PAYEE: ["Cette cotisation est déjà payée.", "This contribution is already paid.", "Mchango huu tayari umelipwa."],
  DEMANDE_EN_ATTENTE: ["Une demande est déjà en attente.", "A request is already pending.", "Ombi tayari linasubiri."],
  DEMANDE_EXISTANTE: ["Une demande existe déjà.", "A request already exists.", "Ombi tayari lipo."],
  DEMANDE_INTROUVABLE: ["Demande introuvable.", "Request not found.", "Ombi halijapatikana."],
  DEUXIEME_ADMIN_REQUIS: ["Choisissez d'abord un deuxième administrateur.", "Choose a second admin first.", "Chagua msimamizi wa pili kwanza."],
  DEVISE_INVALIDE: ["Devise invalide.", "Invalid currency.", "Sarafu si sahihi."],
  ECHANGE_IMPOSSIBLE: ["Cet échange de tour est impossible.", "This turn swap is not possible.", "Kubadilishana zamu huku hakuwezekani."],
  ECHANGE_INTROUVABLE: ["Échange introuvable.", "Swap not found.", "Ubadilishanaji haujapatikana."],
  ECHEANCES_INVALIDES: ["Échéances invalides.", "Invalid due dates.", "Tarehe za malipo si sahihi."],
  FORBIDDEN: ["Action non autorisée.", "Not allowed.", "Hairuhusiwi."],
  GROUPE_COMPLET: ["Ce groupe est complet.", "This group is full.", "Kikundi hiki kimejaa."],
  GROUPE_NON_LANCE: ["Tontine pas encore lancée.", "Group not launched yet.", "Kikundi bado hakijaanzishwa."],
  "Groupe invalide": ["Groupe invalide.", "Invalid group.", "Kikundi si sahihi."],
  INVALID_AMOUNT: ["Montant invalide.", "Invalid amount.", "Kiasi si sahihi."],
  JOUR_J_NON_DEPASSE: ["Possible seulement après la date limite.", "Only possible after the due date.", "Inawezekana baada ya tarehe ya mwisho tu."],
  LITIGES_CONFIRMATION_REQUISE: ["Confirmation requise : cette personne a des litiges dans d'autres groupes.", "Confirmation required: this person has disputes in other groups.", "Uthibitisho unahitajika: mtu huyu ana migogoro katika vikundi vingine."],
  LITIGE_INTROUVABLE: ["Litige introuvable.", "Dispute not found.", "Mgogoro haujapatikana."],
  MEMBRE_INTROUVABLE: ["Membre introuvable.", "Member not found.", "Mwanachama hajapatikana."],
  MEMBRE_INVALIDE: ["Membre invalide.", "Invalid member.", "Mwanachama si sahihi."],
  MODE_INVALIDE: ["Mode invalide.", "Invalid mode.", "Hali si sahihi."],
  MONTANT_INVALIDE: ["Montant invalide.", "Invalid amount.", "Kiasi si sahihi."],
  NOM_REQUIS: ["Le nom est requis.", "Name is required.", "Jina linahitajika."],
  NOT_FOUND: ["Introuvable.", "Not found.", "Haijapatikana."],
  NUMERO_INVALIDE: ["Numéro invalide.", "Invalid number.", "Namba si sahihi."],
  PAS_LE_PAYEUR: ["Vous n'êtes pas le payeur désigné.", "You are not the designated payer.", "Wewe si mlipaji aliyeteuliwa."],
  PAYEUR_REQUIS: ["Choisissez un payeur.", "Choose a payer.", "Chagua mlipaji."],
  PENALITE_INVALIDE: ["Montant de pénalité invalide.", "Invalid penalty amount.", "Kiasi cha adhabu si sahihi."],
  PROPRE_COTISATION: ["Vous ne pouvez pas faire cela pour votre propre cotisation.", "You cannot do this for your own contribution.", "Huwezi kufanya hivi kwa mchango wako mwenyewe."],
  ROTATION_2_PAYEURS: ["Choisissez au moins 2 payeurs pour une rotation.", "Choose at least 2 payers for a rotation.", "Chagua walipaji angalau 2 kwa mzunguko."],
  TAUX_INTERET_MAX_8: ["Le taux d'intérêt ne peut pas dépasser 8 %.", "Interest cannot exceed 8%.", "Riba haiwezi kuzidi 8%."],
  TITRE_REQUIS: ["Le titre est requis.", "Title is required.", "Kichwa kinahitajika."],
  VOTE_CLOS: ["Ce vote est clos.", "This vote is closed.", "Kura hii imefungwa."],
  "Accès de test indisponible sur ce site.": ["Accès de test indisponible sur ce site.", "Test access is unavailable on this site.", "Ufikiaji wa majaribio haupatikani kwenye tovuti hii."],
  "Impossible de préparer le compte de test.": ["Impossible de préparer le compte de test.", "Could not prepare the test account.", "Imeshindwa kuandaa akaunti ya majaribio."],
  "Impossible d'ouvrir la session de test.": ["Impossible d'ouvrir la session de test.", "Could not open the test session.", "Imeshindwa kufungua kipindi cha majaribio."],
  "Impossible de préparer le profil de test.": ["Impossible de préparer le profil de test.", "Could not prepare the test profile.", "Imeshindwa kuandaa wasifu wa majaribio."],
};

const GENERIC: T = ["Une erreur est survenue. Réessayez.", "Something went wrong. Please try again.", "Hitilafu imetokea. Jaribu tena."];

/** Translates a server error into the user's language. Unknown technical messages become a generic text. */
export function translateError(e: unknown, fallback?: T): string {
  const raw = (e instanceof Error ? e.message : typeof e === "string" ? e : "").trim();
  const l = currentLang();
  const say = (t: T) => pick(l, { fr: t[0], en: t[1], sw: t[2] });
  if (raw.startsWith("LITIGE_PRIORITAIRE:"))
    return say(["Réglez d'abord votre ancien litige : ", "Settle your older dispute first: ", "Lipa kwanza deni la zamani: "]) + raw.split(":").slice(1).join(":");
  const exact = CODES[raw];
  if (exact) return say(exact);
  const code = Object.keys(CODES).find((k) => /^[A-Z0-9_]+$/.test(k) && raw.includes(k));
  if (code) return say(CODES[code]!);
  if (/Unauthorized|401|JWT/i.test(raw)) return say(["Connectez-vous pour continuer.", "Sign in to continue.", "Ingia ili kuendelea."]);
  return say(fallback ?? GENERIC);
}
