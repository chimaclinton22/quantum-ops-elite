/* =====================================================
   Quantum OPS Elite - Service Worker
   Handles Push Notifications + Offline + Sound
   ===================================================== */

const CACHE_NAME = 'quantum-ops-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Quantum OPS Elite',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: '/notifications.html'
  };

  try {
    if (event.data) {
      const json = event.data.json();
      data = { ...data, ...json };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'New update from Quantum OPS',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    vibrate: [120, 80, 120],
    data: {
      url: data.url || '/notifications.html',
      dateOfArrival: Date.now()
    },
    requireInteraction: false,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Quantum OPS Elite', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/notifications.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
