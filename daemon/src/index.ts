import { createServer } from 'node:http';

import { readOrCreateToken } from './auth/token.ts';
import { watchBuild } from './build-watch.ts';
import { config } from './config.ts';
import { isInsideHerdr, listAgents } from './herdr/client.ts';
import { log } from './logger.ts';
import { cleanExpiredPicks } from './payload/cleanup.ts';
import { createPickTracker } from './picks/pick-tracker.ts';
import { createRequestListener } from './server/router.ts';
import { createRoutes } from './server/routes/index.ts';
import { showIntro } from './terminal/intro.ts';

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

  // Not awaited: the server starts while the banner plays, and its log lines wait for the card.
  void showIntro(token.value, config.version);

  const cleanup = await cleanExpiredPicks();
  if (!cleanup.ok) log.warn(cleanup.error);

  const builds = watchBuild(config.distDir);
  const picks = createPickTracker({ listAgents });
  const server = createServer(
    createRequestListener(createRoutes(builds, token.value, picks), token.value),
  );

  server.on('error', (cause: NodeJS.ErrnoException) => {
    const message =
      cause.code === 'EADDRINUSE'
        ? `Port ${config.port} is already taken — the daemon may already be running.`
        : `Server error: ${cause.message}`;
    log.error(message);
    builds.stop();
    picks.stop();
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    log.ready(`Listening on http://${config.host}:${config.port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.info('Shutting down.');
      builds.stop();
      picks.stop();
      server.close(() => process.exit(0));
    });
  }
}

void main();
