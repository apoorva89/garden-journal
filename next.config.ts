import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/garden-journal',
  assetPrefix: '/garden-journal/',
  trailingSlash: true,
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
