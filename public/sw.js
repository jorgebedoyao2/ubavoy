const CACHE_NAME = 'ubavoy-v1.1.0';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/firebase_config.js',
  '/icon-192.svg',
  '/icon-512.svg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Instalación e inicio de caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ [ServiceWorker] Pre-cargando activos PWA');
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('⚠️ [ServiceWorker] Error al precargar activos opcionales:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación y limpieza de caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 [ServiceWorker] Eliminando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de solicitudes red/caché
self.addEventListener('fetch', (event) => {
  // Ignorar solicitudes no-GET o de Firebase Firestore backend (WebSocket / RPC)
  if (event.request.method !== 'GET' || event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar de caché y actualizar en segundo plano
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Offline fallback */});
        return cachedResponse;
      }

      // Si no está en caché, realizar la petición en red
      return fetch(event.request).catch(() => {
        // Responder con la página principal si es navegación HTML en modo offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
