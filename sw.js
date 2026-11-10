// Service worker: permite instalar la app y abrirla sin señal.
// Cambia la versión cuando subas cambios para forzar la actualización.
const VERSION = "equipos-v4";
const BASE = [
  "./", "index.html", "css/styles.css", "js/app.js", "js/config.js", "js/backend.js",
  "js/scanner.js", "js/imagen.js", "manifest.webmanifest",
  "panel/", "panel/index.html", "js/admin.js", "css/admin.css",
  "js/catalogo.js", "js/iconos.js", "js/turnos.js", "js/vendor/qrcode.js",
  "img/logo-cerroverde.png", "img/logo-freeport.svg", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const propio = url.origin === location.origin;
  const libreria = url.hostname === "www.gstatic.com" || url.hostname === "cdn.jsdelivr.net";
  if (!propio && !libreria) return; // Firestore y demás van directo a la red

  if (libreria) {
    // librerías con versión fija: primero caché
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); return res;
    })));
    return;
  }
  // archivos de la app: primero red (para recibir cambios), si no hay señal, caché
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
