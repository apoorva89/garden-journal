import type { MetadataRoute } from 'next';
import { BASE_PATH } from '../base-path.mjs';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Garden Journal',
    short_name: 'Garden',
    description: 'Personal garden journal',
    start_url: BASE_PATH + '/',
    scope: BASE_PATH + '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#4a7c59',
    background_color: '#ffffff',
    icons: [
      { src: BASE_PATH + '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: BASE_PATH + '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: BASE_PATH + '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: BASE_PATH + '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
