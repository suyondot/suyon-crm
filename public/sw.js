// Service worker: la app abre al instante desde el celular/PC y se actualiza sola por detrás.
// - Archivos de la app: se sirven de la copia guardada y se revisa la red en segundo plano.
//   Si hay versión nueva, se guarda y la app muestra «Nueva versión · Actualizar».
// - Cambiar CACHE en cada cambio de la app: así la versión nueva se baja completa de una vez.
const CACHE = 'scrm-v52';
const SHELL = ['/', '/app.css', '/app.js', '/bot.js', '/clientes.js', '/reportes.js', '/pedidos.js', '/envios.js', '/asistente.js', '/carritos.js', '/panel.js', '/respuestas.js', '/ogg.js', '/icon.svg', '/logo-mark.png', '/icon-192.png', '/manifest.webmanifest'];
// Páginas que arma el servidor (no son la app): siempre de la red
const SERVER = /^\/(api|webhook|privacidad|eliminar-datos|terminos|planes|inicio|shopify|__test|sw\.js)(\/|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

let told = 0;
async function tellUpdate() {
  if (Date.now() - told < 10000) return;
  told = Date.now();
  const list = await self.clients.matchAll({ type: 'window' });
  for (const w of list) w.postMessage({ type: 'update' });
}

// Revisa la red y guarda la copia nueva; avisa si cambió
async function refresh(key, req) {
  const cache = await caches.open(CACHE);
  const old = await cache.match(key);
  const res = await fetch(req, { cache: 'no-cache' });
  if (!res.ok || res.type !== 'basic') return res;
  await cache.put(key, res.clone());
  const a = old?.headers.get('etag');
  const b = res.headers.get('etag');
  if (old && a && b && a !== b) tellUpdate();
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || SERVER.test(url.pathname)) return;
  const isPage = e.request.mode === 'navigate';
  const isShell = SHELL.includes(url.pathname) && !url.search;
  if (!isPage && !isShell) return; // fotos, landing, etc.: lo normal del navegador
  const key = isPage ? '/' : url.pathname;
  e.respondWith(
    caches.match(key).then((hit) => {
      const net = refresh(key, isPage ? '/' : e.request);
      if (hit) {
        e.waitUntil(net.catch(() => {}));
        return hit;
      }
      return net.catch(() => caches.match(key));
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list[0];
      if (win) {
        win.focus();
        win.postMessage(data);
      } else self.clients.openWindow('/');
    })
  );
});
