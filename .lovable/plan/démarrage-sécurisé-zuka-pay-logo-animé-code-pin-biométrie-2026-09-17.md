# Démarrage sécurisé ZUKA PAY : logo animé, code PIN, biométrie

## Parcours

- Ouverture → logo centré sur fond clair, apparition courte en fondu + léger agrandissement (déjà en place, conservé).
- Session existante + PIN déjà créé → écran de déverrouillage (PIN ou biométrie) avant tout accès à l'accueil.
- Session existante sans PIN (premier passage) → écran de création du PIN, puis proposition d'activer la biométrie, puis accueil.
- Aucune session → écran de connexion par téléphone existant, puis création du PIN.
- Déconnexion → session fermée, PIN et clé biométrique effacés, prochaine ouverture sur connexion.

## Écran de déverrouillage

- Titre « Bienvenue sur ZUKA PAY », sous-titre « Entrez votre code PIN », 4 points de saisie remplis au fur et à mesure, jamais les chiffres.
- Clavier numérique intégré (1-9, effacer, 0, valider) avec grandes touches adaptées au mobile.
- Bouton biométrie affiché seulement si l'appareil en dispose réellement, libellé adapté (Face ID / empreinte) et déclenchement automatique à l'ouverture.
- Lien « PIN oublié ? » → déconnexion propre et retour à la connexion par téléphone et code SMS.
- Écran de création : saisie du PIN puis confirmation, refus si les deux ne correspondent pas ou si le code n'a pas exactement 4 chiffres, refus des codes trop évidents (0000, 1234).

## Sécurité

- Le PIN n'est jamais stocké ni transmis en clair : dérivation PBKDF2-SHA256 (sel aléatoire, 150 000 itérations) via l'API de chiffrement du navigateur, seul le condensé et le sel sont conservés localement, liés à l'identifiant du compte connecté.
- Biométrie via WebAuthn (authentificateur intégré de l'appareil) : l'application ne reçoit jamais d'empreinte ni de données faciales, seulement une confirmation de réussite ; la clé est liée au compte et supprimée à la déconnexion.
- Blocage progressif : à partir de 3 erreurs, attente croissante (30 s, 1 min, 5 min, 15 min, 30 min) persistée sur l'appareil, donc conservée après fermeture ou redémarrage ; compte à rebours affiché.
- Le verrou est réappliqué à chaque ouverture, au retour d'arrière-plan après 60 s, et ne peut pas être contourné par une URL directe : il couvre toutes les pages utilisateur.
- L'espace administrateur garde son propre contrôle d'accès et n'est pas concerné.

## Détails techniques

- Nouveau module `src/lib/security/lock.ts` : dérivation et vérification du PIN, stockage local (`zuka.lock.v1` : sel, condensé, itérations, état des tentatives, identifiant WebAuthn), aucune valeur sensible en clair.
- Nouveau contexte `src/lib/security/LockProvider.tsx` : état `loading | signedOut | needsSetup | locked | unlocked`, écoute de `supabase.auth.onAuthStateChange`, des événements `visibilitychange`/`pagehide` pour le reverrouillage.
- `src/components/zuki/SplashGate.tsx` : après le logo, rend l'écran de verrouillage ou de création au lieu du contenu, garde la redirection vers `/connexion` sans session, reste inactif sous `/admin`.
- Nouveaux composants `src/components/zuki/LockScreen.tsx` et `PinPad.tsx`, tokens de couleur existants uniquement.
- `src/routes/profil.tsx` : section Sécurité (changer le PIN, activer/désactiver la biométrie) et bouton « Se déconnecter » qui efface la session et les données de verrouillage.
- Traductions FR/EN/SW ajoutées dans `src/lib/i18n.tsx`.
- Aucune modification des groupes, cotisations, transactions, base de données ou logique de paiement.

## Vérification

- Parcours testé au navigateur : sans session, avec session sans PIN, avec session verrouillée, PIN erroné jusqu'au blocage, PIN oublié, déconnexion puis réouverture.
- Rendu mobile et ordinateur, modes clair et sombre, sans erreur de compilation ni d'exécution.
