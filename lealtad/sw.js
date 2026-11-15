// Guarda la página de tarjetas en el celular para que abra aunque los datos móviles fallen.
// Siempre intenta primero la red (para tener la versión más nueva) y, si falla, usa la copia guardada.
// Los datos de las tarjetas (Google) nunca se guardan aquí: siempre se piden en vivo.
const CACHE = 'jireh-lealtad-v1';
const BASICOS = ['./', 'qrcode.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('jireh-lealtad-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const esPagina = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const red = fetch(req).then((res) => {
      if (res.ok) cache.put(esPagina ? './' : req, res.clone());
      return res;
    });
    try {
      // si la red se queda colgada más de 6 s y ya hay copia, se muestra la copia
      const lenta = new Promise((_, no) => setTimeout(() => no(new Error('lenta')), 6000));
      return await Promise.race([red, lenta]);
    } catch (err) {
      // la página se guarda una sola vez, sin importar el ?c=JR-XXXX de cada clienta
      const copia = await cache.match(esPagina ? './' : req, { ignoreSearch: true });
      if (copia) return copia;
      return red;  // sin copia: esperar a la red, aunque tarde
    }
  })());
});
