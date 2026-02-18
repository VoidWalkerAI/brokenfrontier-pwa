/* Broken Frontier PWA Service Worker (offline-safe, GitHub Pages friendly)
   - Caches ONLY same-origin assets (your GitHub Pages site)
   - NEVER intercepts cross-origin requests (e.g., workers.dev)
*/

const CACHE_NAME = "bf-rpg-cache-v16"; // bump this every time you change SW
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./save.js",
  "./gm.schema.js",
  "./manifest.json",
  "./service-worker.js",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
  })());
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // IMPORTANT: Never mess with non-GET (POST to GM endpoint must pass through untouched)
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // IMPORTANT: Never intercept cross-origin (workers.dev, api, fonts, etc.)
  if (url.origin !== self.location.origin) {
    return; // let the browser handle it normally
  }

  event.respondWith((async () => {
    // Cache-first for same-origin GETs
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);

      // Only cache successful basic/cors responses
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }

      return res;
    } catch (e) {
      // Offline fallback: app shell
      const shell = await caches.match("./index.html");
      return shell || new Response("Offline", { status: 200 });
    }
  })());
});
