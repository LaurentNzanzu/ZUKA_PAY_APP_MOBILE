# Invitations de groupe par lien + QR Code

## Ce qui sera construit

1. **Lien + QR Code par groupe** — créés automatiquement avec le groupe (et rattrapés pour les groupes existants). Format : `https://zukapay.cash/rejoindre/<jeton>`. Jeton long et aléatoire, impossible à deviner ni à modifier pour tomber sur un autre groupe.
2. **Section « INVITER DES MEMBRES »** sur la page du groupe (réservée aux administrateurs) :
   - Partager le lien (partage natif du téléphone, sinon copie)
   - Afficher le QR Code en grand (carte avec logo ZUKA PAY + nom du groupe)
   - « Télécharger le QR Code » (image PNG) et imprimer
   - Révoquer / régénérer le lien
3. **Page d'accueil de l'invitation** `/rejoindre/<jeton>` :
   - Vérifie l'invitation sur le serveur (valide, non révoquée, non expirée, groupe actif, places restantes)
   - Montre seulement les infos autorisées : nom, photo, description, nombre de membres, cotisation, fréquence, nombre d'échéances, règles principales
   - Bouton « DEMANDER À JOINDRE LE GROUPE », remplacé par « DEMANDE EN ATTENTE » après envoi
   - Messages clairs pour : déjà membre (ouvre le groupe), demande déjà envoyée, lien expiré/révoqué, groupe fermé, groupe complet
4. **Invitation conservée** — si la personne n'est pas connectée, l'invitation est mémorisée ; après connexion/inscription elle revient automatiquement sur ce groupe.
5. **Demandes d'adhésion pour l'administrateur** — liste des demandes sur la page du groupe. Si le demandeur a un litige en cours ailleurs, alerte exacte : « Cette personne a des litiges dans d'autres groupes. Voulez-vous toujours l'accepter dans ce groupe ? » avec « ACCEPTER QUAND MÊME » / « REFUSER ». Aucun détail des litiges (montants, groupes, personnes) n'est montré, seulement leur existence.
6. **Décision** — accepter : la personne devient membre, est notifiée, décision inscrite dans le journal du groupe (qui a accepté malgré l'alerte). Refuser : notification de refus.

## Limite importante : Play Store / App Store

ZUKA PAY n'est pas encore publiée sur Google Play ni sur l'App Store, et l'application téléphone n'existe pas encore. Pour l'instant :
- Le lien et le QR Code ouvrent la version web de ZUKA PAY, qui marche sur Android, iPhone et ordinateur, depuis WhatsApp, SMS, Facebook ou l'appareil photo.
- La page d'invitation est prête à rediriger vers Google Play / l'App Store selon le téléphone : il suffira d'ajouter les adresses des fiches une fois l'application publiée (réglage dans /admin/paramètres).
- L'ouverture directe dans l'application installée et la conservation de l'invitation pendant l'installation (le « deferred deep linking ») ne pourront être branchées et testées sur de vrais Android/iPhone qu'une fois l'application publiée. Je ne peux pas faire ces tests aujourd'hui.

## Détails techniques

- Migration : `tontines.invite_token` (unique, 32 octets aléatoires en base64url), `invite_revoked_at`, `invite_expires_at` nullable ; nouvelle table `tontine_join_requests` (tontine_id, user_id, status pending/accepted/refused, has_disputes figé au moment de la demande, decided_by, decided_at, override_disputes), index unique partiel (tontine_id, user_id) WHERE status='pending'. GRANT + RLS : le demandeur voit ses demandes, les admins du groupe voient celles de leur groupe ; écritures uniquement via serveur.
- Server functions (`src/lib/tontines/invites.functions.ts`) : `getInvitePreview(token)` (public, champs limités), `requestToJoin`, `listJoinRequests`, `decideJoinRequest` (revérifie admin, places, litiges via `member_debts` statut ouvert, crée `tontine_members`, `notifications`, `group_activity`, `audit_logs`), `rotateInviteLink`.
- QR généré côté navigateur avec la librairie `qrcode`, composé dans un canvas (logo + nom) pour le PNG ; partage via `navigator.share` avec fichier quand disponible.
- Jeton en attente stocké en localStorage (`zuka.pendingInvite`) et consommé après connexion dans `connexion.tsx`.
- Réglages `app_settings` : `store.android_url`, `store.ios_url` ; redirection sur la page d'invitation seulement si renseignés et si on n'est pas déjà dans l'application.
- Tests Playwright : admin affiche/télécharge le QR, second compte ouvre le lien déconnecté → connexion → retour au groupe → demande → admin voit l'alerte litige → accepte / refuse.
