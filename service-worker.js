/* Broken Frontier PWA Service Worker (GitHub Pages friendly, update-safe) */

const CACHE_NAME = "bf-rpg-cache-v30"; // bump when you change frontend files
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./save.js",
  "./gm.schema.js",
  "./manifest.json",
  "./service-worker.js"
];

// Only these get "network-first" so updates land cleanly.
const SHELL = new Set(CORE);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE); // If this fails, install fails (good: prevents broken installs)
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

  // Never touch non-GET (protect GM POST calls)
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin requests (GitHub Pages scope)
  if (url.origin !== self.location.origin) return;

  // Navigation requests: offline fallback to app shell
  const isNav = req.mode === "navigate";

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // For core shell files: try network first (fresh updates), fallback to cache
    if (SHELL.has(url.pathname.replace(/^\//, "./")) || SHELL.has("./" + url.pathname.replace(/^\//, ""))) {
      try {
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        // If even shell is missing, last resort for nav
        if (isNav) return (await cache.match("./index.html")) || new Response("Offline", { status: 200 });
        return new Response("Offline", { status: 503 });
      }
    }

    // For everything else: cache-first (fast)
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      cache.put(req, res.clone());
      return res;
    } catch {
      if (isNav) return (await cache.match("./index.html")) || new Response("Offline", { status: 200 });
      return new Response("Offline", { status: 503 });
    }
  })());
});
