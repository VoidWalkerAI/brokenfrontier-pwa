/* ============================================================
   🪨 CAVECODE — LOCKED BLOCK
   BROKEN FRONTIER RPG — SERVICE WORKER v55

   PURPOSE:
   Keep the PWA installable/offline-friendly while preferring fresh
   HTML/JS/CSS/JSON during development and campaign testing.

   RUNTIME REPAIR 003:
   Legacy scenes.js is removed from the core cache because campaigns
   now load through the private IPC Worker rather than browser scenes.
   ============================================================ */

const CACHE_NAME = "brokenfrontier-cache-v55";

const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./save.js",
  "./gm.schema.js",
  "./app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)));
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
    return p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".json") || p.endsWith(".html");
  } catch {
    return req.mode === "navigate";
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

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

    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      try {
        const url = new URL(req.url);
        if (url.origin === self.location.origin && res && res.ok) cache.put(req, res.clone());
      } catch {}
      return res;
    } catch {
      return new Response("Offline", { status: 503 });
    }
  })());
});
