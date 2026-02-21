/* Broken Frontier RPG Service Worker (GitHub Pages safe)
   CACHE v49 — 2026-02-20
   - Relative paths (./) for repo subpath compatibility
   - Cache-first for core shell, stale-while-revalidate for everything else
*/

const CACHE_NAME = "brokenfrontier-cache-v49";

const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./save.js",
  "./gm.schema.js",
  "./app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
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
        // keep SW alive while updating the shell
        event.waitUntil(
          fetch(req).then((r) => cache.put("./index.html", r.clone())).catch(() => {})
        );
        return cached;
      }
      // If not cached yet, fall through to network
    }

    // Stale-while-revalidate for everything else (same-origin)
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      try {
        const url = new URL(req.url);
        if (url.origin === self.location.origin && res && res.ok) {
          cache.put(req, res.clone());
        }
      } catch {}
      return res;
    }).catch(() => cached);

    // keep SW alive while updating the cache
    event.waitUntil(fetchPromise.catch(() => {}));

    return cached || fetchPromise;
  })());
});
