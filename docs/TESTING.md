# Protocole de Tests End-to-End — Authentification OTP (ZUKA PAY)

> **Projet :** ZUKA PAY (TanStack Start + Supabase + Infobip)  
> **Tâche :** T1.7 — Tests manuels end-to-end du flux OTP  
> **Date de démarrage :** 2026-11-02  

---

## Tableau de suivi des 10 scénarios

- [x] **SCÉNARIO 1 — Envoi WhatsApp réussi**
  - **Action :** Saisir un numéro avec WhatsApp actif sur la page `/connexion`.
  - **Attendu :** Message « Code envoyé via WhatsApp » + code reçu sur le téléphone.
  - **Vérif DB :** `SELECT * FROM auth_otps ORDER BY created_at DESC LIMIT 1;` (`channel = 'whatsapp'`)
  - **Statut :** **VALIDÉ** (Code reçu sur WhatsApp et vérifié avec succès)

- [x] **SCÉNARIO 2 — Fallback SMS (numéro sans WhatsApp)**
  - **Action :** Saisir un numéro SANS WhatsApp (ex: un fixe ou un numéro non enregistré).
  - **Attendu :** Message « Code envoyé par SMS » + SMS reçu (ou gestion propre du refus opérateur).
  - **Vérif DB :** `SELECT * FROM auth_otps ORDER BY created_at DESC LIMIT 1;` (`channel = 'sms'`)
  - **Statut :** **VALIDÉ** (Fallback SMS déclenché + gestion des erreurs de provisionnement validée)

- [x] **SCÉNARIO 3 — Cooldown (Anti-spam 60s)**
  - **Action :** Redemander un code immédiatement après le scénario 1 ou 2.
  - **Attendu :** Message d'erreur avec compte à rebours (ex: « Patientez 45s »).
  - **Vérif DB :** Aucune nouvelle ligne dans `auth_otps`.
  - **Statut :** **VALIDÉ** (Blocage UI avec compte à rebours + blocage backend actif)

- [x] **SCÉNARIO 4 — Vérification réussie (Session)**
  - **Action :** Saisir le code à 6 chiffres correct reçu par WhatsApp/SMS.
  - **Attendu :** Redirection vers l'accueil, session Supabase créée.
  - **Vérif :** Écran de configuration code PIN (`LockProvider`) si nouvel appareil.
  - **Statut :** **VALIDÉ** (Code consommé `is_used = true` et session créée)

- [x] **SCÉNARIO 5 — Code incorrect (5 tentatives)**
  - **Action :** Saisir un mauvais code 5 fois de suite.
  - **Attendu :** Message « Trop de tentatives incorrectes » au 5ème essai, cases et bouton verrouillés.
  - **Vérif DB :** `SELECT attempts, is_used FROM auth_otps ORDER BY created_at DESC LIMIT 2;` (`attempts = 5`, `is_used = true`).
  - **Statut :** **VALIDÉ** (Blocage strict après 5 tentatives : UI verrouillée et code invalidé)

- [x] **SCÉNARIO 6 — Expiration (5 minutes)**
  - **Action :** Demander un code, puis simuler l'expiration en base :  
    `UPDATE auth_otps SET expires_at = now() - interval '1 minute' WHERE is_used = false;`  
    Puis saisir le code correct.
  - **Attendu :** Message « Code incorrect ou expiré ».
  - **Statut :** **VALIDÉ** (Code expiré ou consommé rejeté systématiquement)

- [x] **SCÉNARIO 7 — Rate Limit (Limite IP & Device)**
  - **Action :** Atteindre les seuils de limitation (IP, 10 min, ou 24h Device).
  - **Attendu :** Message de blocage (« Trop de demandes... » ou « Limite de demandes atteinte pour cet appareil »).
  - **Vérif DB :** `SELECT count(*) FROM auth_otp_rate_limits WHERE action = 'send';`
  - **Statut :** **VALIDÉ** (Blocage actif par IP et par Device ID validé sur l'UI)

- [x] **SCÉNARIO 8 — Utilisateur existant (Pas de doublon)**
  - **Action :** Se déconnecter, puis se reconnecter avec un numéro qui a déjà un compte.
  - **Attendu :** Retrouve le compte existant (pas de nouvelle création de compte).
  - **Vérif DB :** `SELECT count(*) FROM auth.users WHERE phone = '243972811353';` (Strictement 1 compte réutilisé sans doublon).
  - **Statut :** **VALIDÉ** (Compte existant préservé, 0 doublon généré)

- [x] **SCÉNARIO 9 — Nouvel utilisateur (Email virtuel)**
  - **Action :** Se connecter avec un nouveau numéro.
  - **Attendu :** Nouveau compte créé avec email virtuel.
  - **Vérif DB :** `SELECT email FROM auth.users WHERE phone = '243972811353';` (`243972811353@otp.zukapay.cash`).
  - **Statut :** **VALIDÉ** (Email virtuel @otp.zukapay.cash généré automatiquement lors de la création)

- [x] **SCÉNARIO 10 — Déclenchement du Cron (Option 3)**
  - **Action :** Vider `cron_runs` (`DELETE FROM cron_runs;`), puis rafraîchir n'importe quelle page de l'application.
  - **Attendu :** Le middleware déclenche le cron en arrière-plan.
  - **Vérif DB :** `SELECT id, kind, status, triggered_by, started_at, duration_ms FROM public.cron_runs ORDER BY started_at DESC LIMIT 1;` (`status = 'success'`, `triggered_by = 'request'`).
  - **Statut :** **VALIDÉ** (Déclenchement automatique par requête HTTP via le middleware en tâche de fond validé)

---

## Journal des Exécutions

| Scénario | Date / Heure | Résultat | Détails / Notes |
| :--- | :--- | :--- | :--- |
| 1. WhatsApp | 2026-11-02 11:44 | SUCCÈS | Code reçu sur WhatsApp (expéditeur 243890043844) et vérifié avec succès |
| 2. Fallback SMS | 2026-11-02 12:30 | SUCCÈS | Fallback SMS activé suite à absence WhatsApp, erreurs opérateur journalisées proprement |
| 3. Cooldown 60s | 2026-11-02 12:40 | SUCCÈS | Compte à rebours affiché, bouton désactivé, backend refuse toute demande < 60s |
| 4. Session réussie | 2026-11-02 12:50 | SUCCÈS | Code validé, OTP marqué is_used=true, session Supabase et user_phones créés |
| 5. 5 essais max | 2026-11-02 13:42 | SUCCÈS | Blocage strict après 5 tentatives : UI verrouillée, TOO_MANY_ATTEMPTS renvoyé |
| 6. Expiration | 2026-11-02 13:46 | SUCCÈS | Code expiré rejeté : « Code incorrect ou expiré », session non créée |
| 7. Rate limit IP & Device | 2026-11-02 16:03 | SUCCÈS | Blocage rate limit validé : toast DEVICE_LIMIT affiché après dépassement du quota |
| 8. Pas de doublon | 2026-11-02 16:30 | SUCCÈS | Compte existant réutilisé sans création de doublon dans auth.users |
| 9. Nouvel utilisateur | 2026-11-02 16:30 | SUCCÈS | Email virtuel <numéro>@otp.zukapay.cash généré automatiquement |
| 10. Cron middleware | 2026-11-02 16:59 | SUCCÈS | Exécution automatique déclenchée par requête : status success, triggered_by request |
