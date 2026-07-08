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
