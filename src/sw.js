import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

clientsClaim();
cleanupOutdatedCaches();

// The array below is replaced by workbox-build at build time with the
// list of files produced by `next export`. The id param is ignored so that
// navigating to /entry/?id=123 still matches the cached /entry/ HTML.
precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^id$/],
});

self.addEventListener('install', () => {
  console.log('[SW] Installed');
});

self.addEventListener('activate', () => {
  console.log('[SW] Activated');
});
