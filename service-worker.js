// AI Daily Digest — service worker
// v12: Phase F-1 — Web Push 通知 (push / notificationclick ハンドラ追加)
const VERSION = "v12";
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
  // Weekly page (Phase E)
  "./weekly/",
  "./weekly/index.html",
  "./weekly/app-weekly.js",
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
function isWeeklyLatestOrIndex(url) {
  return /\/data\/weekly-(latest|index)\.json(\?|$)/.test(url);
}
function isWeeklyJson(url) {
  return /\/data\/weekly-\d{4}-W\d{2}\.json(\?|$)/.test(url);
}
function isStaticAsset(url) {
  return /\/(index\.html|offline\.html|manifest\.webmanifest|assets\/.+|weekly\/(index\.html|app-weekly\.js))$/.test(url) || url.endsWith("/") || url.endsWith("/weekly/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // network-first for latest.json / index.json / weekly-latest.json / weekly-index.json
  if (isLatestOrIndex(url.pathname) || isWeeklyLatestOrIndex(url.pathname)) {
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

  // cache-first for past day JSON / past weekly JSON
  if (isDayJson(url.pathname) || isWeeklyJson(url.pathname)) {
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

// === Web Push (Phase F-1) ===
// 送信側 (scripts/send-push.mjs) が { title, body, url, tag } を送る。
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "AI Daily Digest", {
      body: d.body || "今日の AI ニュースが更新されました",
      icon: "./assets/icons/icon-192.png",
      badge: "./assets/icons/icon-192.png",
      tag: d.tag || "aidd-daily",
      renotify: true,
      data: { url: d.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // 既に開いているタブがあればフォーカス、無ければ新規に開く
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate?.(target);
          return w.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
