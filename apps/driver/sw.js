/**
 * UbaVoy - Service Worker de la app del DOMICILIARIO
 * ===========================================================================
 * Dos reglas que aprendimos a la mala:
 *
 *  1. El HTML SIEMPRE se pide a la red primero. Si se sirve desde caché, una
 *     versión rota o a medias se queda pegada para siempre y la app abre en
 *     blanco, sin forma de recuperarse desde el celular.
 *
 *  2. La precarga NUNCA debe usar cache.addAll con una lista fija: si UNO
 *     solo de los recursos da 404, addAll rechaza entero y el service worker
 *     no llega a instalarse. Eso fue exactamente lo que pasó cuando los
 *     iconos .svg se reemplazaron por .png: la lista seguía pidiendo el svg,
 *     el install fallaba y el celular quedaba servido por la versión vieja.
 */

const CACHE_NAME = 'ubavoy-driver-v19';

const RECURSOS = [
  '/apps/driver/',
  '/apps/driver/manifest.json',
  '/icon-driver-192.png',
  '/icon-driver-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Uno por uno y tolerando fallos: que falte un recurso no puede impedir
    // que el service worker se instale.
    await Promise.all(RECURSOS.map(async (url) => {
      try { await cache.add(url); }
      catch (e) { console.warn('[SW driver] no se pudo precargar', url); }
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

  // Firestore y las APIs nunca se cachean.
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('googleapis.com') ||
      url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML: red primero, caché solo si no hay internet.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/apps/driver/', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('/apps/driver/')) ||
               new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Recursos estáticos: caché primero, y se refresca en segundo plano.
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

// Notificación al tocarla: abre la app del domiciliario.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/apps/driver/'));
});
