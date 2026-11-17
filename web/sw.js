// Service worker: app works offline, but always prefers the newest version online.
//
// BUILD is replaced by scripts/build_site.py with a hash of the web/ files, so
// every deploy that changes the app changes this file. Browsers compare sw.js
// byte by byte to detect an update; the page (app.js) asks for that check when
// the app is opened or brought back to the foreground.
const BUILD = "__BUILD__";
const SHELL = `shell-${BUILD}`;
const DATA = "data";
const SHELL_FILES = [
  "./", "index.html", "style.css", "i18n.js", "names.js", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/qr.svg",
];
const NET_TIMEOUT_MS = 4000;

// Price data saved at install too, so the app works offline right after the first
// visit (that visit's own requests ran before this worker existed). Best effort.
const DATA_FILES = ["api/latest.json", "api/mpob.json", "api/fama.json"];

self.addEventListener("install", (e) => {
  // Fetch fresh copies (skip the HTTP cache) so the new version is complete.
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => caches.open(DATA))
      .then((c) => Promise.all(DATA_FILES.map((u) =>
        fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null))))
      .then(() => self.skipWaiting()) // take over at once, no waiting for tabs to close
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (revalidated, not from HTTP cache); after a timeout or offline, use the cache.
function networkFirst(request, cacheName) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(request, { ignoreSearch: cacheName === SHELL });
    const timer = setTimeout(() => {
      fromCache().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, NET_TIMEOUT_MS);

    fetch(request, { cache: "no-cache" })
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(cacheName).then((c) => c.put(request, copy)); }
        clearTimeout(timer);
        if (!settled) { settled = true; resolve(r); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((hit) => {
          if (settled) return;
          settled = true;
          resolve(hit || new Response("Luar talian", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
        });
      });
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/api/")) {
    e.respondWith(networkFirst(e.request, DATA));
    return;
  }
  if (url.pathname.includes("/icons/")) {
    // Icons rarely change: cache first.
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
    return;
  }
  // Pages, scripts, styles: newest when online.
  e.respondWith(networkFirst(e.request, SHELL));
});
