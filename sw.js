// Service Worker: macht die App offline nutzbar.
//
// Strategie:
//   - Programmdateien (HTML, JS, CSS): zuerst aus dem Internet, damit nach einem Update
//     nie alte und neue Dateien gemischt werden. Ohne Internet aus dem Zwischenspeicher.
//   - Große, selten geänderte Dateien (Lebensmittel-Datenbank, Scanner, Icons): aus dem
//     Zwischenspeicher, im Hintergrund aktualisiert.
//   - Anfragen an fremde Server (Open Food Facts, Rezeptseiten) gehen immer direkt ins Internet.

const CACHE = 'ernaehrungsapp-v3';
const CORE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/core/nutrients.js',
  'js/core/targets.js',
  'js/core/portions.js',
  'js/core/ingredients.js',
  'js/core/recipe-calc.js',
  'js/core/stats.js',
  'js/data/db.js',
  'js/data/repo.js',
  'js/data/foods.js',
  'js/data/backup.js',
  'js/data/openfoodfacts.js',
  'js/data/recipes.js',
  'js/data/recipe-import.js',
  'js/platform/scanner.js',
  'js/platform/files.js',
  'js/ui/dom.js',
  'js/ui/bars.js',
  'js/ui/diary.js',
  'js/ui/add-food.js',
  'js/ui/food-editor.js',
  'js/ui/targets-view.js',
  'js/ui/settings.js',
  'js/ui/recipes.js',
  'js/ui/stats.js',
  'data/bls.json',
  'vendor/zxing/zxing-reader.js',
  'vendor/zxing/zxing_reader.wasm',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

const CACHE_FIRST = /\/(data|vendor|icons)\//;

self.addEventListener('install', (e) => {
  // "reload" umgeht den HTTP-Cache des Browsers, damit wirklich die neue Version gespeichert wird
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fromNetwork = () =>
        fetch(e.request, { cache: 'no-cache' }).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        });

      if (CACHE_FIRST.test(url.pathname)) {
        const update = fromNetwork().catch(() => cached);
        return cached || update;
      }
      try {
        return await fromNetwork();
      } catch {
        return cached || Response.error();
      }
    })
  );
});
