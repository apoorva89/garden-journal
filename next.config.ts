import type { NextConfig } from 'next';
import { BASE_PATH } from './base-path.mjs';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH + '/',
  trailingSlash: true,
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
