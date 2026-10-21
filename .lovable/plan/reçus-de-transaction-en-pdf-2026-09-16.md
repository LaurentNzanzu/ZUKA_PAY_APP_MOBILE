# Reçus de transaction en PDF

Chaque paiement de ZUKI pourra être téléchargé, partagé ou imprimé sous forme de reçu A4 propre.

## Ce que l'utilisateur verra

- Dans **Profil → Historique**, chaque ligne de transaction devient cliquable et reçoit une petite icône 📄.
- Un panneau de détail s'ouvre avec toutes les informations réelles de la transaction, puis trois actions :
  - **Télécharger en PDF**
  - **Partager** (partage natif du téléphone : WhatsApp, e-mail, etc. ; masqué si l'appareil ne le propose pas)
  - **Imprimer** (boîte d'impression native du téléphone ou de l'ordinateur)
- Dans le détail d'un groupe, la liste des paiements reçoit la même icône 📄 vers le même panneau.

## Contenu du reçu

Logo ZUKI et nom de l'application, puis :
identifiant unique et référence, date et heure, type d'opération (cotisation de tontine),
montant et devise (CDF ou USD), nom et numéro du payeur, nom et numéro du bénéficiaire du tour,
nom du groupe, numéro et date de l'échéance concernée, moyen de paiement (Mobile Money),
référence fournisseur si disponible, et statut affiché tel qu'il est réellement :
Réussie / En attente / En cours / Échouée / Annulée / Expirée — jamais présenté comme réussi s'il ne l'est pas.

Un bandeau de statut coloré et une mention « Reçu généré par ZUKI » avec l'identifiant unique
figurent sur le document, ainsi qu'une note précisant qu'un reçu en attente ne vaut pas preuve de paiement.

## Détails techniques

- Ajout de `jspdf` pour générer le PDF côté client (fonctionne hors ligne, Android/iOS/Web).
- Nouveau `src/lib/zuki/receipt.ts` : construit un objet reçu à partir de la transaction réelle du store
  (groupe, échéance, membre payeur, bénéficiaire du tour) et dessine le PDF A4 avec les tokens de couleur ZUKI.
- Le logo est embarqué en base64 au moment de la génération via `fetch` de l'asset existant.
- Nouveau `src/components/zuki/ReceiptSheet.tsx` : feuille de détail + actions, style identique à `PaySheet`.
- Impression : rendu du même PDF dans un iframe masqué puis `print()`, avec repli sur une fenêtre d'impression HTML A4 si le navigateur bloque l'iframe.
- Partage : `navigator.share` avec le fichier PDF, repli automatique sur le téléchargement.
- Clés de traduction FR/EN/SW ajoutées dans `src/lib/i18n.tsx`.
- Aucune modification du moteur de paiement, des routes admin ou du thème.

## Vérification

Test Playwright sur des transactions réussie, en attente et échouée, en CDF et en USD,
avec contrôle que le PDF généré contient bien les valeurs de la transaction sélectionnée.
