# Backend réel et administrable pour ZUKA PAY

## Ce qui existe déjà

- Base de données avec administrateurs, rôles, permissions fines, invitations, journal d'audit, tarifs des groupes, abonnements, fournisseurs Mobile Money, transactions et rappels signés des opérateurs.
- Back-office `/admin` protégé : tableau de bord, administrateurs, tarification, abonnements, Mobile Money, transactions, journal d'audit.
- Paiement Mobile Money réel : demande envoyée à l'agrégateur, confirmation par rappel signé ou lecture de statut.

## Le vrai manque

Les tontines, membres, échéances, cotisations, invitations, votes, échanges de tours et notifications vivent **uniquement dans le téléphone de l'utilisateur** (stockage local). Rien n'est partagé entre membres, rien n'est visible par l'administration. C'est ce que ce travail corrige.

## Ce qui sera construit

### 1. Base de données des tontines (migration)

Nouvelles tables liées par clés étrangères : `tontines`, `tontine_members`, `tontine_invitations`, `contribution_periods` (échéances), `contributions` (dû / payé / statut par membre et par échéance), `beneficiary_order`, `beneficiary_swaps`, `group_votes` + `vote_responses`, `group_activity`, `notifications`, `app_settings`, `sms_providers`, `system_events`.

Règles d'accès : un membre ne voit que les tontines dont il fait partie ; seul l'administrateur du groupe modifie le groupe ; l'administration plateforme accède en lecture via ses permissions. Contributions et transactions ne sont jamais modifiables directement par le client.

### 2. Logique serveur (aucune écriture sensible côté téléphone)

Fonctions serveur pour : créer une tontine et générer ses échéances, inviter/accepter/refuser un membre, enregistrer une cotisation, demander/accepter/refuser un échange de tour avec recalcul de l'ordre, ouvrir et clôturer un vote, lire le tableau de suivi d'un groupe, lire le tableau de bord personnel, marquer une notification comme lue.

Le paiement existant sera relié à ces cotisations réelles : une confirmation de l'opérateur met à jour la cotisation et le statut du membre automatiquement.

### 3. Migration de l'application utilisateur

`src/lib/zuki/store.tsx` cesse d'être la source de vérité : accueil, groupes, détail de groupe, tours, votes, contrat, profil et paiement lisent et écrivent via le serveur. Les données déjà présentes sur l'appareil sont importées une seule fois vers le compte connecté, puis le stockage local ne sert plus que de cache hors-ligne.

### 4. Notifications

Table de notifications + règles d'envoi : rappel J-3, J-1, jour de l'échéance, retard, confirmation de paiement, réception de tour, invitation, échange de tour. Anti-spam : une seule notification par type, par échéance et par membre. Envoi in-app immédiat ; SMS envoyé seulement si un fournisseur SMS est activé. Déclenchement par tâche planifiée quotidienne appelant un point d'entrée protégé par secret.

### 5. Fournisseur SMS administrable

Écran `/admin/sms` : nom, mode bac à sable/production, identifiants, numéro émetteur, pays autorisés, actif/inactif, test d'envoi réel. Les secrets restent côté serveur, jamais renvoyés au navigateur (seuls les 4 derniers caractères sont affichés). Adaptateur Twilio d'abord, architecture ouverte aux autres.

### 6. Écrans d'administration ajoutés

- `/admin/utilisateurs` : liste, recherche, profil, téléphone, statut, groupes, activité, activer/désactiver.
- `/admin/tontines` : toutes les tontines avec créateur, membres, montant, fréquence, durée, ordre des bénéficiaires, échéances, retards, paiements, statut ; filtres par date, statut, créateur, nombre de membres, devise, fréquence.
- `/admin/notifications` : historique, état d'envoi, renvoi.
- `/admin/invitations` : invitations de groupes en cours.
- `/admin/parametres` : nom de l'application, langues, devises, limites de transaction, réglages de notifications, mode maintenance, version minimale, messages système.
- `/admin/sante` : état Base de données / Authentification / Mobile Money / SMS / Notifications / Rappels / API / Tâches planifiées / Stockage en 🟢🟡🔴, avec les dernières erreurs réelles.
- Webhooks : adresses de rappel et derniers événements reçus, avec état de signature.

Chaque écran écrit dans le journal d'audit (qui, quand, quoi, ancienne et nouvelle valeur, résultat).

### 7. Tarifs d'abonnement

Les paliers seront alignés sur ceux demandés (2–5 : 1 $, 6–10 : 2 $, 11–20 : 4 $, 21–50 : 7 $, 51–100 : 12 $, 101–250 : 20 $, 250+ : sur devis) et restent modifiables depuis `/admin/pricing`. Le tarif est figé au début du cycle selon le nombre de membres actifs.

## Ordre de livraison

1. Migration base de données + règles d'accès + paramètres et fournisseurs SMS.
2. Fonctions serveur des tontines, cotisations, tours, votes, invitations.
3. Bascule de l'application utilisateur vers le serveur + reprise des données locales.
4. Notifications et tâche planifiée de rappels.
5. Nouveaux écrans d'administration + page de santé.
6. Vérification de bout en bout : création de tontine, invitation, cotisation, paiement, échange de tour, notification, visibilité dans l'administration.

## Ce que vous devrez fournir

- **Twilio** (ou autre) : identifiants SMS, à saisir dans `/admin/sms` — sans eux, les codes de connexion et les rappels SMS restent inactifs (le reste fonctionne).
- **Agrégateur Mobile Money** : identifiants marchands de production, à saisir dans `/admin/fournisseurs`.

Rien d'autre n'est simulé : toute fonction affichée sans clé sera clairement marquée comme non configurée plutôt que d'afficher un faux succès.
