/**
 * UbaVoy - Service Worker de la app del ADMINISTRADOR
 * ===========================================================================
 * Dos reglas que aprendimos a la mala:
 *
 *  1. El HTML SIEMPRE se pide a la red primero. Antes esta app usaba
 *     cache-first para todo, asi que una vez guardada la pagina ya no se
 *     actualizaba nunca, y si quedaba cacheada a medias abria en blanco sin
 *     forma de recuperarse desde el celular.
 *
 *  2. La precarga NUNCA debe usar cache.addAll con una lista fija: si UNO
 *     solo de los recursos da 404, addAll rechaza entero y el service worker
 *     no llega a instalarse. Paso al reemplazar los iconos .svg por .png.
 */

const CACHE_NAME = 'ubavoy-admin-v6';

const RECURSOS = [
  '/apps/admin/',
  '/apps/admin/manifest.json',
  '/icon-admin-192.png',
  '/icon-admin-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(RECURSOS.map(async (url) => {
      try { await cache.add(url); }
      catch (e) { console.warn('[SW admin] no se pudo precargar', url); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('googleapis.com') ||
      url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML: red primero, cache solo si no hay internet.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/apps/admin/', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('/apps/admin/')) ||
               new Response('Sin conexion', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Recursos estaticos: cache primero.
  event.respondWith((async () => {
    const enCache = await caches.match(req);
    if (enCache) return enCache;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
