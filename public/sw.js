// Minimal shell service worker for LifeOS.
// Bumped v8 → v9 alongside the scheduled-notification message handler
// so returning users pick up the new SW rather than the cached-old one.
const CACHE = 'lifeos-shell-v9';
const SHELL = ['/', '/manifest.json'];

// Scheduled local notifications. Timers live in the SW rather than the page
// because iOS Safari suspends the page's JS the moment the app is
// backgrounded — a setTimeout in the page won't fire until the user
// returns. SW timers get a longer background execution window on iOS, so
// short-to-medium notifications (rest timers, HIIT intervals, cardio
// sessions) can fire close to on-time even with the app in the background.
// Not bulletproof — Apple can and does suspend SWs too — but it's the
// cheapest workable path before reaching for server-scheduled push.
const scheduledTimers = new Map();

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'schedule-notification') {
    const { id, title, body, at, tag } = data;
    if (!id || !title || typeof at !== 'number') return;
    // Cancel any existing timer for the same id — used when adjusting a
    // rest timer's duration mid-count (±30s buttons).
    const existing = scheduledTimers.get(id);
    if (existing) clearTimeout(existing);
    const delay = at - Date.now();
    if (delay <= 0) {
      scheduledTimers.delete(id);
      return;
    }
    const timeoutId = setTimeout(() => {
      scheduledTimers.delete(id);
      self.registration.showNotification(title, {
        body: body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        // Defaults to the same tag fireLocalNotification uses so that if
        // BOTH paths fire (foreground completion: SW timer AND the
        // client-side effect), the second call replaces the first
        // visually — one notification on screen, not two.
        tag: tag || 'lifeos-local',
        renotify: true,
      });
    }, delay);
    scheduledTimers.set(id, timeoutId);
  } else if (data.type === 'cancel-notification') {
    const { id } = data;
    const existing = scheduledTimers.get(id);
    if (existing) {
      clearTimeout(existing);
      scheduledTimers.delete(id);
    }
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigation: network first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Static assets: cache first, populate on miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

// Push notifications. The api/push function sends a JSON payload with
// { title, body, url } — we render it via the SW so it works even when the
// app is fully closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'LifeOS', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'LifeOS';
  const body = data.body || '';
  const url = data.url || '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'lifeos',
      renotify: true,
      data: { url },
    })
  );
});

// Tapping a notification focuses an existing tab, or opens one if none.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (w.url.includes(self.location.origin)) {
            return w.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
