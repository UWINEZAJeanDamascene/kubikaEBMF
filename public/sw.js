const CACHE_VERSION = 'v7-kubika-pwa-icons';
const STATIC_CACHE = `stock-mgt-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `stock-mgt-dynamic-${CACHE_VERSION}`;
const API_CACHE = `stock-mgt-api-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Static assets to pre-cache during install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/favicon.svg',
  '/kubika-system-logo.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png'
];

// API endpoints that can be cached for offline use
const CACHEABLE_API_PATTERNS = [
  /\/api\/products\?/,
  /\/api\/categories$/,
  /\/api\/suppliers\?/,
  /\/api\/clients\?/,
  /\/api\/dashboard\//,
];

// Max items in dynamic cache
const DYNAMIC_CACHE_LIMIT = 80;
const API_CACHE_LIMIT = 40;
// Max age for API cache entries (5 minutes)
const API_CACHE_MAX_AGE = 5 * 60 * 1000;

// ─── IndexedDB for offline queue ────────────────────

const DB_NAME = 'stock-offline-db';
const DB_VERSION = 1;
const QUEUE_STORE = 'offlineQueue';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function addToQueue(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.add({ ...entry, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeQueuedNonReplayableRequests() {
  const items = await getQueuedItems();
  await Promise.all(
    items
      .filter((item) => {
        const pathname = new URL(item.url).pathname;
        return pathname.startsWith('/api/auth/')
          || pathname === '/api/performance/client'
          || pathname.endsWith('/api/sales-legacy/direct-sale')
          // Retired checkout path — still strip if an old client queued it.
          || pathname.endsWith('/api/pos/sale')
          || pathname.startsWith('/socket.io/');
      })
      .map((item) => removeFromQueue(item.id))
  );
}

// ─── Cache helpers ──────────────────────────────────

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Remove oldest entries
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  }
}

// ─── Install ────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ───────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Remove old versioned caches
              return name.startsWith('stock-mgt-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE && 
                     name !== API_CACHE;
            })
            .map((name) => {
              console.log('[SW] Removing old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
      .then(() => removeQueuedNonReplayableRequests())
  );
});

// ─── Fetch strategies ───────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isReportExport = /^\/api\/reports\/.+\/(pdf|excel)$/.test(url.pathname);

  // Socket.IO polling uses POST for transport packets, not replayable app writes.
  if (url.pathname.startsWith('/socket.io/')) return;

  // Authentication must always be handled directly by the page. Do not cache
  // or queue login, registration, or password requests for background sync.
  if (url.pathname.startsWith('/api/auth/')) return;

  // Anonymous telemetry is best-effort and cannot use credentialed wildcard CORS.
  if (url.pathname === '/api/performance/client') {
    event.respondWith(
      fetch(request.clone(), { credentials: 'omit', mode: 'cors' })
        .catch(() => new Response(null, { status: 204 }))
    );
    return;
  }

  // POS checkout is never replayed by the generic offline queue. It changes
  // stock, accounting, fiscal state, and tender records; only the POS client
  // may retry it with its original idempotency key and exact payload.
  // Canonical path: /api/sales-legacy/direct-sale. /api/pos/sale is retired (410).
  if (request.method === 'POST'
    && (url.pathname.endsWith('/api/sales-legacy/direct-sale') || url.pathname.endsWith('/api/pos/sale'))) {
    return;
  }

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE' || request.method === 'PATCH') {
    const isAuth = /\/api\/auth\//.test(url.pathname);
    if (isAuth) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      fetch(request.clone(), { credentials: 'include', mode: 'cors' })
        .then(async (response) => response.ok ? response : fetch(request))
        .catch(async () => {
          try {
            const body = await request.clone().text();
            await addToQueue({
              url: request.url,
              method: request.method,
              headers: Object.fromEntries(request.headers.entries()),
              body: body
            });
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'OFFLINE_QUEUED',
                message: "Action saved offline. It will sync when you're back online.",
                url: request.url,
                method: request.method
              });
            });
            if (self.registration.sync) {
              await self.registration.sync.register('sync-offline-queue');
            }
            return new Response(
              JSON.stringify({
                success: true,
                offline: true,
                message: 'Saved offline. Will sync when back online.'
              }),
              { status: 202, headers: { 'Content-Type': 'application/json' } }
            );
          } catch {
            return fetch(request);
          }
        })
    );
    return;
  }

  // Report exports are live file downloads. Never replace them with offline JSON.
  if (request.method === 'GET' && isReportExport) {
    event.respondWith(fetch(request.clone()));
    return;
  }

  // API requests: Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname + url.search));

    event.respondWith(
      fetch(request.clone())
        .then(async (response) => {
          if (response.ok && isCacheable) {
            const cache = await caches.open(API_CACHE);
            // Store with timestamp header for TTL management
            const headers = new Headers(response.headers);
            headers.set('sw-cache-time', String(Date.now()));
            const clonedResponse = new Response(await response.clone().blob(), {
              status: response.status,
              statusText: response.statusText,
              headers
            });
            cache.put(request, clonedResponse);
            trimCache(API_CACHE, API_CACHE_LIMIT);
          }
          return response;
        })
        .catch(async () => {
          // Try cache
          const cached = await caches.match(request);
          if (cached) {
            // Check TTL
            const cacheTime = Number(cached.headers.get('sw-cache-time') || 0);
            if (Date.now() - cacheTime < API_CACHE_MAX_AGE || !navigator.onLine) {
              return cached;
            }
          }
          return new Response(
            JSON.stringify({ success: false, error: 'offline', message: 'You are offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Static assets: Cache-first
  if (/\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|otf|eot|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => {
          // Return nothing for missing images
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  // JS/CSS bundles: Stale-while-revalidate
  if (/\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request);
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            await cache.put(request, response.clone());
            await trimCache(DYNAMIC_CACHE, DYNAMIC_CACHE_LIMIT);
            return response;
          }
          return cachedResponse || response;
        } catch {
          return cachedResponse || new Response('/* Offline: asset unavailable */', {
            status: 503,
            headers: { 'Content-Type': 'application/javascript' },
          });
        }
      })()
    );
    return;
  }

  // HTML pages: Network-first with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(request, response.clone());
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return (await cached) || (await caches.match(OFFLINE_URL)) || new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
    );
    return;
  }

  // Default: Network first, cache fallback
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(request, response.clone());
          trimCache(DYNAMIC_CACHE, DYNAMIC_CACHE_LIMIT);
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || new Response(
        JSON.stringify({ success: false, error: 'offline', message: 'You are offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ))
  );
});

// ─── Background Sync ────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  console.log('[SW] Processing offline queue...');
  const items = await getQueuedItems();

  if (!items.length) {
    console.log('[SW] No queued items to sync');
    return;
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
        // Ensure credentials (cookies) are included when syncing queued requests
        credentials: 'include',
        mode: 'cors'
      });

      if (response.ok) {
        await removeFromQueue(item.id);
        syncedCount++;
      } else {
        failedCount++;
        console.warn(`[SW] Sync failed for ${item.method} ${item.url}: ${response.status}`);
      }
    } catch (err) {
      failedCount++;
      console.error(`[SW] Sync error for ${item.method} ${item.url}:`, err);
    }
  }

  // Notify clients about sync results
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      synced: syncedCount,
      failed: failedCount,
      message: `Synced ${syncedCount} offline action${syncedCount !== 1 ? 's' : ''}${failedCount > 0 ? `, ${failedCount} failed` : ''}`
    });
  });

  console.log(`[SW] Sync complete: ${syncedCount} synced, ${failedCount} failed`);
}

// ─── Push Notifications ─────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || 'New notification' };
  }

  const title = data.title || 'KUBIKA SYSTEM';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    tag: data.tag || 'default',
    renotify: !!data.tag,
    data: {
      url: data.url || '/dashboard',
      type: data.type || 'general'
    },
    actions: []
  };

  // Add contextual actions based on notification type
  if (data.type === 'low_stock') {
    options.actions = [
      { action: 'view', title: 'View Stock' },
      { action: 'dismiss', title: 'Dismiss' }
    ];
    options.data.url = '/stock';
  } else if (data.type === 'new_order') {
    options.actions = [
      { action: 'view', title: 'View Order' },
      { action: 'dismiss', title: 'Dismiss' }
    ];
    options.data.url = data.url || '/invoices';
  } else if (data.type === 'backup_complete') {
    options.actions = [
      { action: 'view', title: 'View Backups' }
    ];
    options.data.url = '/backups';
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification Click ─────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const url = event.notification.data?.url || '/dashboard';

  if (action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window
        return self.clients.openWindow(url);
      })
  );
});

// ─── Message handler for client communication ───────

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_QUEUE_STATUS':
      getQueuedItems().then(items => {
        event.source.postMessage({
          type: 'QUEUE_STATUS',
          count: items.length,
          items: items.map(i => ({ url: i.url, method: i.method, timestamp: i.timestamp }))
        });
      });
      break;

    case 'CLEAR_API_CACHE':
      caches.delete(API_CACHE).then(() => {
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      });
      break;

    case 'FORCE_SYNC':
      processOfflineQueue().then(() => {
        event.source.postMessage({ type: 'FORCE_SYNC_DONE' });
      });
      break;
  }
});

// ─── Periodic sync (if supported) ───────────────────

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(processOfflineQueue());
  }
});
