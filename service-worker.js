// Mission 1000 v2.2.0
// Intentionally no persistent cache while the core/data layer is stabilised.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});
