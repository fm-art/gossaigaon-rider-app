import {initializeApp} from 'firebase/app';
import {getMessaging, onBackgroundMessage} from 'firebase/messaging/sw';
import {CacheableResponsePlugin} from 'workbox-cacheable-response';
import {ExpirationPlugin} from 'workbox-expiration';
import {cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry} from 'workbox-precaching';
import {registerRoute} from 'workbox-routing';
import {CacheFirst} from 'workbox-strategies';

interface SwClient {
  url: string;
  focus: () => Promise<SwClient>;
  postMessage: (message: unknown) => void;
}

interface SwWindowClients {
  matchAll: (options?: {type?: 'window' | 'worker' | 'sharedworker' | 'all'; includeUncontrolled?: boolean}) => Promise<SwClient[]>;
  openWindow: (url: string) => Promise<SwClient | null>;
  claim: () => Promise<void>;
}

interface SwNotificationEvent extends Event {
  notification: {
    data?: {tab?: string; url?: string};
    close: () => void;
  };
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SwPushEvent extends Event {
  data?: {
    json: () => {
      notification?: {title?: string; body?: string; icon?: string};
      data?: {tab?: string; url?: string; fromFcmInternal?: boolean};
    };
    text: () => string;
  };
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SwScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  skipWaiting: () => Promise<void>;
  clients: SwWindowClients;
  registration: ServiceWorkerRegistration;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
}

declare const self: SwScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

registerRoute(
  ({url}) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({statuses: [0, 200]}),
      new ExpirationPlugin({maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365}),
    ],
  }),
);

registerRoute(
  ({url}) =>
    url.origin === 'https://tile.openstreetmap.org' && url.pathname.endsWith('.png'),
  new CacheFirst({
    cacheName: 'gossaigaon-osm-tiles-v1',
    plugins: [
      new CacheableResponsePlugin({statuses: [200]}),
      new ExpirationPlugin({maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30}),
    ],
  }),
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const extendable = event as Event & {waitUntil: (p: Promise<unknown>) => void};
  extendable.waitUntil(self.clients.claim());
});

const firebaseConfig = {
  apiKey: 'AIzaSyCuJLxRCdhAVZoN81-5weEFnSU4nDr98lo',
  authDomain: 'test-2a0d0.firebaseapp.com',
  databaseURL: 'https://test-2a0d0-default-rtdb.firebaseio.com',
  projectId: 'test-2a0d0',
  storageBucket: 'test-2a0d0.firebasestorage.app',
  messagingSenderId: '396740286096',
  appId: '1:396740286096:web:430751766ca9c384946a15',
  measurementId: 'G-W05VPQX3V2',
};

try {
  const fbApp = initializeApp(firebaseConfig);
  const messaging = getMessaging(fbApp);

  onBackgroundMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Gossaigaon Fleet Alert';
    const body = payload.notification?.body || 'New update in your rider terminal.';
    const tab = payload.data?.tab || 'active';

    void self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.messageId || 'fcm-bg-alert',
      data: {tab, url: `/?tab=${tab}`},
    });
  });
} catch {
  // Ignore messaging init failure in unsupported environments
}

self.addEventListener('push', (rawEvent) => {
  const event = rawEvent as SwPushEvent;
  if (!event.data) return;

  let title = 'Gossaigaon Fleet';
  let body = 'New trip or dispatch update received.';
  let tab = 'active';

  try {
    const parsed = event.data.json();
    // Skip if already handled by FCM payload format to prevent duplicate notifications
    if (parsed && parsed.notification && parsed.data?.fromFcmInternal) return;
    title = parsed.notification?.title || title;
    body = parsed.notification?.body || body;
    tab = parsed.data?.tab || tab;
  } catch {
    body = event.data.text() || body;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'gossaigaon-web-push',
      data: {tab, url: `/?tab=${tab}`},
    }),
  );
});

self.addEventListener('notificationclick', (rawEvent) => {
  const event = rawEvent as SwNotificationEvent;
  event.notification.close();
  const targetTab = event.notification.data?.tab || 'active';
  const targetUrl = event.notification.data?.url || `/?tab=${targetTab}`;

  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({type: 'NAVIGATE_TAB', tab: targetTab});
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
