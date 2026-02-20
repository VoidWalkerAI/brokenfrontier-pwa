/* Broken Frontier RPG Service Worker (GitHub Pages safe)
   CACHE v41 — 2026-02-20
   - Relative paths (./) for repo subpath compatibility
   - Cache-first for core shell, stale-while-revalidate for everything else
*/

const CACHE_NAME = "brokenfrontier-cache-v41";

const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css?v=43",
  "./save.js?v=43",
  "./gm.schema.js?v=43",
  "./app.js?v=43"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache-first for navigation (shell)
    if (req.mode === "navigate") {
      const cached = await cache.match("./index.html");
      if (cached) {
        // Update in background
        event.waitUntil(fetch(req).then((r) => cache.put("./index.html", r.clone())).catch(() => {}));
        return cached;
      }
    }

    // Stale-while-revalidate for everything else (same-origin)
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      // Only cache successful same-origin responses
      try {
        const url = new URL(req.url);
        if (url.origin === self.location.origin && res && res.ok) {
          cache.put(req, res.clone());
        }
      } catch {}
      return res;
    }).catch(() => cached);

    return cached || fetchPromise;
  })());
});
