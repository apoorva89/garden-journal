import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { injectManifest } from 'workbox-build';
import { writeFileSync, unlinkSync } from 'fs';

// Inject first into a temp file, then bundle. This ensures self.__WB_MANIFEST
// appears exactly once when workbox-build scans src/sw.js, and is already
// replaced with the real array before rollup bundles in the workbox packages.
const INJECTED_TMP = 'out/sw-injected.js';

try {
  const { count, size } = await injectManifest({
    swSrc: 'src/sw.js',
    swDest: INJECTED_TMP,
    globDirectory: 'out',
    globPatterns: [
      '**/*.html',
      '_next/static/**/*.{js,css}',
      '**/*.{png,svg,ico,webp}',
      '**/*.{woff,woff2}',
      'manifest.json',
    ],
    modifyURLPrefix: { '': '/garden-journal/' },
  });

  const bundle = await rollup({
    input: INJECTED_TMP,
    plugins: [
      replace({ 'process.env.NODE_ENV': JSON.stringify('production'), preventAssignment: true }),
      nodeResolve(),
    ],
  });

  const { output } = await bundle.generate({ format: 'iife' });
  writeFileSync('out/sw.js', output[0].code);
  await bundle.close();

  console.log(`[SW] Precached ${count} files (${(size / 1024).toFixed(1)} kB)`);
} finally {
  try { unlinkSync(INJECTED_TMP); } catch { /* file may not exist if injectManifest failed */ }
}
