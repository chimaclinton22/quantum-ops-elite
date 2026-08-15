/* =====================================================
   Quantum OPS Elite - Service Worker
   Handles Push Notifications + Offline + Sound
   ===================================================== */

const CACHE_NAME = 'quantum-ops-v1';

// Files to cache (optional – helps the app open faster)
const PRECACHE = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/manifest.json'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE).catch(() => {});
    })
  );
});

/* ---------- ACTIVATE ---------- */
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

/* ---------- PUSH (THIS IS THE IMPORTANT PART) ---------- */
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
    // if the push is just text
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'New update from Quantum OPS',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    vibrate: [120, 80, 120],          // vibration pattern (Android)
    data: {
      url: data.url || '/notifications.html',
      dateOfArrival: Date.now()
    },
    requireInteraction: false,        // auto-dismiss after a while
    silent: false                     // IMPORTANT → allows sound
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Quantum OPS Elite', options)
  );
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/notifications.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open → focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
