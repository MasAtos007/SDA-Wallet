const CACHE_NAME = "sda-wallet-v108";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./img/sda.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  self.skipWaiting(); // langsung aktif
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener("fetch", (event) => {

  const url = event.request.url;

  // File JS/CSS/JSON: SELALU ambil fresh dari network (bypass HTTP cache juga),
  // supaya perubahan kode langsung kepakai tanpa perlu clear data manual.
  const isDevAsset = /\.(js|css|json)(\?|$)/.test(url);

  if (isDevAsset) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Selain itu (index.html, gambar, font, dll): pakai cache-first seperti biasa
  event.respondWith(
    caches.match(event.request).then((res) => {
      return res || fetch(event.request);
    })
  );
});