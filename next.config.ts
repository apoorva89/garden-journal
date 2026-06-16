import type { NextConfig } from 'next';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  skipWaiting: true,
  clientsClaim: true,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/garden-journal',
  assetPrefix: '/garden-journal/',
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {},
};

export default withPWA(nextConfig);
