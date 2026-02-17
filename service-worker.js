/* Broken Frontier PWA Service Worker (offline-safe, GitHub Pages friendly) */

const CACHE_NAME = "bf-rpg-cache-v10";
const CORE = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./service-worker.js"];

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
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
      return res;
    } catch (e) {
      // If offline and not cached, fall back to app shell
      return (await caches.match("./index.html")) || new Response("Offline", { status: 200 });
    }
  })());
});
