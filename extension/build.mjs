import { context } from 'esbuild';
import { watch as watchFiles } from 'node:fs';
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
let copyQueue = Promise.resolve();

function copyPublic() {
  copyQueue = copyQueue.catch(() => {}).then(() => cp('public', 'dist', { recursive: true }));
  return copyQueue;
}

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
  plugins: [
    {
      name: 'copy-public',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length === 0) await copyPublic();
        });
      },
    },
  ],
});

await build.rebuild();

if (watch) {
  await build.watch();
  watchFiles('public', { recursive: true }, () => void copyPublic());
  console.log('watching extension source and public files');
} else {
  await build.dispose();
}
