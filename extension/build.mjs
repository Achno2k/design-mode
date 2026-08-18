import { context } from 'esbuild';
import { cp, rm } from 'node:fs/promises';

/**
 * Bundles each entrypoint into `dist/`, then copies `public/` alongside it.
 *
 * Chrome loads `dist/` as an unpacked extension. Every entrypoint is bundled
 * separately because they run in different places — the service worker, the
 * page, and the popup do not share a module graph.
 */

const ENTRYPOINTS = [
  'src/entrypoints/background.ts',
  'src/entrypoints/content.ts',
  'src/entrypoints/popup.ts',
];

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });

const build = await context({
  entryPoints: ENTRYPOINTS,
  outdir: 'dist',
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  // Sourcemaps only in watch mode; a shipped build should not leak paths.
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
});

await build.rebuild();
await cp('public', 'dist', { recursive: true });

if (watch) {
  await build.watch();
  console.log('watching — reload the extension in chrome://extensions after each change');
} else {
  await build.dispose();
}
