/* Broken Frontier RPG Service Worker (GitHub Pages safe)
   CACHE v53 — DEV-FRIENDLY
   - Relative paths (./) for repo subpath compatibility
   - Network-first for HTML/JS/CSS/JSON so updates show immediately
   - Cache-first for other assets (images, etc.)
*/

const CACHE_NAME = "brokenfrontier-cache-v53";

const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./save.js",
  "./gm.schema.js",
  "./scenes.js",
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

function isDevCritical(req) {
  try {
    const url = new URL(req.url);
    const p = url.pathname.toLowerCase();
    if (req.mode === "navigate") return true;
    return (
      p.endsWith(".js") ||
      p.endsWith(".css") ||
      p.endsWith(".json") ||
      p.endsWith(".html")
    );
  } catch {
    return req.mode === "navigate";
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // ✅ Network-first for dev-critical assets
    if (isDevCritical(req)) {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          try {
            const url = new URL(req.url);
            if (url.origin === self.location.origin) cache.put(req, fresh.clone());
          } catch {}
        }
        return fresh;
      } catch {
        const cached = await cache.match(req) || await cache.match("./index.html");
        return cached || new Response("Offline", { status: 503 });
      }
    }

    // Cache-first for everything else
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      try {
        const url = new URL(req.url);
        if (url.origin === self.location.origin && res && res.ok) {
          cache.put(req, res.clone());
        }
      } catch {}
      return res;
    } catch {
      return new Response("Offline", { status: 503 });
    }
  })());
});
