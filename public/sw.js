/* ReWear service worker.
 * - Precaches the offline page and app icons.
 * - Cache-first for immutable build assets (/_next/static) and fonts.
 * - Stale-while-revalidate for public editorial images.
 * - NEVER caches API responses or authenticated pages (customer, payment or
 *   operational data); those always go to the network, falling back to /offline.
 */
const VERSION = "rewear-v1.0.0";
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Private / dynamic data: network only.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/receipts/"))) return;

  // Immutable build assets & icons.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Public editorial photography.
  if (url.hostname === "images.unsplash.com" || (url.origin === self.location.origin && url.pathname.startsWith("/_next/image"))) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") {
              cache.put(req, res.clone());
              trimCache(IMAGE_CACHE, 80);
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // Page navigations: always network (pages may contain personal data), offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match("/offline")) || Response.error()));
  }
});
