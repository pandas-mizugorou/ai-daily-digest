// AI Daily Digest — service worker
const VERSION = "v2";
const STATIC_CACHE = `aidd-static-${VERSION}`;
const DATA_CACHE = `aidd-data-${VERSION}`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/app.js",
  "./assets/styles.css",
  "./assets/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isLatestOrIndex(url) {
  return /\/data\/(latest|index)\.json(\?|$)/.test(url);
}
function isDayJson(url) {
  return /\/data\/\d{4}-\d{2}-\d{2}\.json(\?|$)/.test(url);
}
function isStaticAsset(url) {
  return /\/(index\.html|offline\.html|manifest\.webmanifest|assets\/.+)$/.test(url) || url.endsWith("/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // network-first for latest.json / index.json
  if (isLatestOrIndex(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // cache-first for past day JSON
  if (isDayJson(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // stale-while-revalidate for static assets
  if (isStaticAsset(url.pathname) || url.pathname === "/") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached || caches.match("./offline.html"));
        return cached || fetchPromise;
      })
    );
    return;
  }
});
