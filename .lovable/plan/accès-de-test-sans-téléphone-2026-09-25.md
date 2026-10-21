# Accès de test sans téléphone

## Objectif
Permettre l’accès temporaire à Zuka Pay sans numéro, SMS ni OTP, tout en conservant le code PIN et la biométrie existants.

## Modifications
- Remplacer le mode actuel « numéro sans SMS » par un compte de test authentifié stable, créé côté serveur sans téléphone.
- Faire démarrer automatiquement cette session de test après le splash lorsqu’aucune session n’existe.
- Retirer du parcours de développement les champs, validations et redirections exigeant un numéro, tout en gardant le parcours OTP intact derrière un réglage unique pour sa future réactivation.
- Ne modifier ni les règles d’accès aux données, ni les rôles, ni les protections PIN/biométriques.

## Vérification
- Tester le parcours complet depuis une session vide : splash → ouverture automatique de la session de test → création/déverrouillage PIN → accueil.
- Confirmer qu’aucun écran téléphone, SMS ou OTP n’apparaît et qu’une session authentifiée valide permet toujours les fonctions protégées.
