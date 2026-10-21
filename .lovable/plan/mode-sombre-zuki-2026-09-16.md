# Mode sombre ZUKI

## Résultat attendu
- Ajouter dans Profil un sélecteur clair/sombre accessible et animé.
- Appliquer le choix immédiatement à l’application utilisateur et au back-office, sans rechargement.
- Conserver le choix sur cet appareil après fermeture, redémarrage et reconnexion.

## Mise en œuvre
1. Créer un fournisseur de thème global qui restaure le choix avant l’affichage et applique la classe sombre au document.
2. Ajouter une palette sombre complète aux tokens sémantiques existants : fonds, cartes, textes, bordures, champs, états et ombres.
3. Ajouter le réglage dans Profil avec les libellés FR, EN et SW et un switch accessible.
4. Remplacer les rares bordures codées en noir par les tokens existants afin qu’elles s’adaptent aux deux thèmes.
5. Vérifier les pages utilisateur et administrateur en clair et sombre, sur mobile et grand écran, ainsi que la persistance après rechargement.

## Détails techniques
- Thème basé sur une classe `dark` au niveau du document et sur les variables globales Tailwind v4.
- Stockage local indépendant de la session pour préserver la préférence à travers les connexions.
- Respect de `prefers-reduced-motion` et de `color-scheme` pour les contrôles natifs.
- Aucun changement de navigation, de logique métier, de données ou d’intégration.
