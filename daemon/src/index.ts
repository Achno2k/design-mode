import { createServer } from 'node:http';

import { watchBuild } from './build-watch.ts';
import { config } from './config.ts';
import { isInsideHerdr } from './herdr/client.ts';
import { log } from './logger.ts';
import { createRequestListener } from './server/router.ts';
import { createRoutes } from './server/routes/index.ts';

/**
 * Entry point.
 *
 * The daemon must run inside a herdr pane: the `herdr` CLI talks to the session
 * that owns the calling terminal, so starting it anywhere else would either
 * fail or, worse, drive somebody else's session.
 */
function main(): void {
  if (!isInsideHerdr()) {
    log.error('Not running inside herdr. Start this from a pane in your herdr session.');
    process.exitCode = 1;
    return;
  }

  const builds = watchBuild(config.distDir);
  const server = createServer(createRequestListener(createRoutes(builds)));

  server.on('error', (cause: NodeJS.ErrnoException) => {
    if (cause.code === 'EADDRINUSE') {
      log.error(`Port ${config.port} is already taken — the daemon may already be running.`);
    } else {
      log.error(`Server error: ${cause.message}`);
    }
    process.exitCode = 1;
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

main();
