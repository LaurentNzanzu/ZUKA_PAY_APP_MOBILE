# 📖 Guide d'installation et de lancement local — ZUKA PAY

Ce guide explique pas à pas comment installer et exécuter l'application **ZUKA PAY** avec sa base de données **Supabase locale** sur n'importe quel ordinateur (Windows, Mac ou Linux).

---

## 📋 Prérequis nécessaires

Avant de commencer, assurez-vous d'avoir installé sur votre ordinateur :

1. **Node.js** (version 20 LTS ou 22 LTS recommandée) :
   * Télécharger : [https://nodejs.org](https://nodejs.org/)
   * Vérifier dans un terminal : `node -v` et `npm -v`
2. **Docker Desktop** (obligatoire pour faire tourner la base Supabase en local) :
   * Télécharger : [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
   * Lancer Docker Desktop et attendre que le moteur soit actif (voyant vert).

---

## 🚀 Étape 1 : Installer les dépendances du projet

Ouvrez un terminal (PowerShell sous Windows ou Terminal sous Mac/Linux) dans le dossier du projet :

```bash
cd zuka-pay-connect
npm install
```

> **Astuce Windows :** Si une erreur du type `is not a valid Win32 application` ou `oxc-parser` apparaît pendant le démarrage, exécutez simplement cette commande de réparation :
> ```bash
> npm install @oxc-parser/binding-win32-x64-msvc@0.120.0 --force
> ```

---

## 🗄️ Étape 2 : Démarrer la base de données Supabase locale

1. Assurez-vous que **Docker Desktop est bien ouvert et actif**.
2. Dans le terminal, à la racine du projet, exécutez :

```bash
npx supabase start
```

*Note : La première fois, Docker télécharge automatiquement les images (PostgreSQL, Authentification, Studio, etc.) et applique toutes les migrations de la base de données. Cela peut prendre 2 à 5 minutes selon votre connexion internet.*

---

## 🔑 Étape 3 : Configurer le fichier `.env`

Créez (ou vérifiez) le fichier `.env` à la racine du projet `zuka-pay-connect` avec les valeurs locales :

```env
SUPABASE_PROJECT_ID="sdlxqhrpmyegxbkpnwba"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
SUPABASE_URL="http://127.0.0.1:54321"

VITE_SUPABASE_PROJECT_ID="sdlxqhrpmyegxbkpnwba"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
VITE_SUPABASE_URL="http://127.0.0.1:54321"
```

---

## 💻 Étape 4 : Lancer l'application web

Dans votre terminal, lancez le serveur de développement :

```bash
npm run dev
```

Une fois lancé, ouvrez votre navigateur web :
* 🌐 **Application ZUKA PAY :** [http://localhost:5173](http://localhost:5173)
* 🗃️ **Tableau de bord Supabase Studio (Gestion de la base locale) :** [http://127.0.0.1:54323](http://127.0.0.1:54323)
* 📧 **Boîte de test des emails/SMS (Mailpit) :** [http://127.0.0.1:54324](http://127.0.0.1:54324)

---

## 🛠️ Commandes utiles au quotidien

| Action | Commande |
| :--- | :--- |
| **Lancer l'application web** | `npm run dev` |
| **Démarrer la base Supabase** | `npx supabase start` |
| **Arrêter la base Supabase** | `npx supabase stop` |
| **Voir l'état et les clés locales** | `npx supabase status` |
| **Réinitialiser la base à zéro (ré-appliquer les migrations)** | `npx supabase db reset` |
