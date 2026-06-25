import type { NextConfig } from 'next'

const buildRevision = String(Date.now())

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  additionalManifestEntries: [
    { url: '/garden-journal/', revision: buildRevision },
    { url: '/garden-journal/journal/', revision: buildRevision },
    { url: '/garden-journal/journal/new/', revision: buildRevision },
    { url: '/garden-journal/journal/entry/', revision: buildRevision },
    { url: '/garden-journal/crops/', revision: buildRevision },
    { url: '/garden-journal/next-season/', revision: buildRevision },
  ],
})

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/garden-journal',
  assetPrefix: '/garden-journal/',
  trailingSlash: true,
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
}

export default withPWA(nextConfig)
