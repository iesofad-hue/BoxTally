// BoxTally offline helper.
// Keeps a copy of the page, its icons, fonts and the database library, so the site opens with no signal.
// Your tools come from the copy the page itself saves in the browser; nothing about your box is stored here.
// Bump VERSION whenever these files change in a way that needs old copies thrown away.
const VERSION = "boxtally-v15";
const SHELL = ["./", "index.html", "tool3d.js", "kit3d.js", "core3d.js", "power3d.js", "storage3d.js", "shop3d.js", "hand3d.js", "vendor/supabase-2.116.0.js", "vendor/three-0.160.0.module.min.js", "vendor/three-addons/controls/OrbitControls.js", "vendor/three-addons/utils/BufferGeometryUtils.js", "privacy.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const CDN = ["https://cdn.jsdelivr.net/", "https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The page itself: always try for the newest, fall back to the saved copy when offline.
  // Addresses like /wishlist or /tool/... are all the same page, so they get index.html straight away.
  if (req.mode === "navigate") {
    const last = url.pathname.split("/").pop();
    if (!last.includes(".") || last === "index.html") {
      e.respondWith(
        (url.pathname === "/" ? fetch(req) : fetch("/", { cache: "no-cache" }))
          .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("index.html", copy)); } return res; })
          .catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
      );
    } else {
      // other pages (privacy.html): the newest, or the saved copy offline
      e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
    }
    return;
  }

  // Fonts and the database library never change at a given address: use the saved copy first.
  if (CDN.some((p) => req.url.startsWith(p))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // BoxTally's own files: answer from the saved copy right away and refresh it in the background.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit || Response.error());
        return hit || fresh;
      })
    );
  }
  // Everything else (the database, analytics) goes straight to the network.
});
