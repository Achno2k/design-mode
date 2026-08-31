import { createServer } from 'node:http';

import { readOrCreateToken } from './auth/token.ts';
import { watchBuild } from './build-watch.ts';
import { config } from './config.ts';
import { isInsideHerdr } from './herdr/client.ts';
import { log } from './logger.ts';
import { cleanExpiredPicks } from './payload/cleanup.ts';
import { createRequestListener } from './server/router.ts';
import { createRoutes } from './server/routes/index.ts';

/** Start the loopback daemon inside the calling herdr pane. */
async function main(): Promise<void> {
  if (!isInsideHerdr()) {
    log.error('Not running inside herdr. Start this from a pane in your herdr session.');
    process.exitCode = 1;
    return;
  }

  const token = await readOrCreateToken();
  if (!token.ok) {
    log.error(token.error);
    process.exitCode = 1;
    return;
  }

  log.info('────────────────────────────────────────────────────────────────');
  log.info(`Pairing code: ${token.value}  (paste this into the extension popup)`);
  log.info('Next: run `npx herdr-design-mode extension` for the folder to load in chrome://extensions,');
  log.info('      then paste this code into the extension popup.');
  log.info('────────────────────────────────────────────────────────────────');

  const cleanup = await cleanExpiredPicks();
  if (!cleanup.ok) log.warn(cleanup.error);

  const builds = watchBuild(config.distDir);
  const server = createServer(createRequestListener(createRoutes(builds, token.value), token.value));

  server.on('error', (cause: NodeJS.ErrnoException) => {
    const message =
      cause.code === 'EADDRINUSE'
        ? `Port ${config.port} is already taken — the daemon may already be running.`
        : `Server error: ${cause.message}`;
    log.error(message);
    builds.stop();
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    log.info(`Listening on http://${config.host}:${config.port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.info('Shutting down.');
      builds.stop();
      server.close(() => process.exit(0));
    });
  }
}

void main();
