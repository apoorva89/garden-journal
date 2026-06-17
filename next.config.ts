import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/garden-journal',
  assetPrefix: '/garden-journal/',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
