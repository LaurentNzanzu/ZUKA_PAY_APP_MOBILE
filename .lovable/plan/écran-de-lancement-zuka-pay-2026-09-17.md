# Écran de lancement ZUKA PAY

## Objectif
Afficher au démarrage le symbole fourni, centré sur un fond minimaliste, avec une apparition courte en fondu et légère mise à l’échelle, puis ouvrir automatiquement l’écran adapté.

## Mise en œuvre
- Importer l’image fournie comme ressource officielle du splash, sans la déformer.
- Ajouter un écran de lancement global qui attend seulement la restauration de la session, reste visible brièvement, puis disparaît avec une transition fluide.
- Respecter les préférences de réduction des animations et les zones sûres mobiles.
- Déterminer la destination depuis la session utilisateur réelle : accueil si une session existe, sinon `/connexion`.
- Créer `/connexion` avec saisie du numéro de téléphone et code OTP, reliée à l’authentification existante.
- Ne pas afficher le splash à répétition pendant la navigation interne.

## Vérification
- Tester le démarrage connecté et déconnecté.
- Vérifier le centrage, la netteté et la transition sur mobile et ordinateur.
- Vérifier l’absence d’erreurs de compilation et d’exécution.

## Hors périmètre
Aucune modification des groupes, cotisations, transactions, données existantes ou règles métier.
