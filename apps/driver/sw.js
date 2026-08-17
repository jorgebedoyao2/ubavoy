const CACHE_NAME = 'ubavoy-driver-v18.0';
const ASSETS_TO_CACHE = [
  '/apps/driver/manifest.json',
  '/icon-192.svg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 Eliminando caché antigua de Driver:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// NOTIFICACIONES PUSH CON PANTALLA APAGADA
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : { title: '🚨 ¡NUEVO MANDADO EN UBATÉ!', body: 'Hay una nueva carrera disponible en la bolsa de trabajo.' };
  const options = {
    body: data.body,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    vibrate: [500, 200, 500, 200, 1000],
    tag: 'new-order-alert',
    renotify: true,
    data: { url: '/apps/driver/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/apps/driver/')
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-First para páginas HTML y llamadas a Firebase Firestore
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.hostname.includes('firestore.googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First para recursos estáticos (CSS, Fuentes, Iconos)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
