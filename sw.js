// Service Worker: macht die App offline nutzbar.
// Eigene Dateien werden zwischengespeichert. Beim Start wird im Hintergrund nach
// einer neuen Version geschaut; die neue Version gilt dann ab dem nächsten Öffnen.
// Anfragen an fremde Server (Open Food Facts) gehen immer direkt ins Internet.

const CACHE = 'ernaehrungsapp-v2';
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
  'data/bls.json',
  'vendor/zxing/zxing-reader.js',
  'vendor/zxing/zxing_reader.wasm',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
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

  // Aus dem Zwischenspeicher antworten, gleichzeitig im Hintergrund aktualisieren
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
