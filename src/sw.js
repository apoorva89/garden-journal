import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const shell = createHandlerBoundToURL(__BASE_PATH__ + '/index.html');
registerRoute(new NavigationRoute(shell, {
  denylist: [/^\/_next\//, /\/api\//],
}));

self.addEventListener('install', () => {
  console.log('[SW] Installed');
});

self.addEventListener('activate', () => {
  console.log('[SW] Activated');
});

// Debug: log every .txt fetch with cache-hit status so we can compare
// the requested URL against what is actually precached.
self.addEventListener('fetch', (event) => {
  if (!event.request.url.includes('.txt')) return;
  event.waitUntil(
    caches.match(event.request).then((cached) =>
      self.clients.matchAll({ type: 'window' }).then((clients) =>
        clients.forEach((c) =>
          c.postMessage({
            type: 'SW_DEBUG',
            url: event.request.url,
            cached: !!cached,
          })
        )
      )
    )
  );
});
