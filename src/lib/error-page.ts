export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Cette page ne s'est pas chargée · This page didn't load</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #4b5563; margin: 0 0 1.5rem; }
    .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
    a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
    .primary { background: #0b3a34; color: #fff; }
    .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    .en { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="fr">
      <h1>Cette page ne s'est pas chargée</h1>
      <p>Une erreur est survenue de notre côté. Vous pouvez actualiser la page ou revenir à l'accueil.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Réessayer</button>
        <a class="secondary" href="/">Accueil</a>
      </div>
    </div>
    <div class="en">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </div>
  <script>
    if (!navigator.language.startsWith('fr')) {
      document.querySelector('.fr').style.display = 'none';
      document.querySelector('.en').style.display = 'block';
      document.documentElement.lang = 'en';
    }
  </script>
</body>
</html>`;
}
