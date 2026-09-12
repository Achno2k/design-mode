import { watch } from 'node:fs';

import { log } from './logger.ts';

export interface BuildWatcher {
  revision(): number;
  waitForChange(since: number, timeoutMs: number): Promise<number>;
  stop(): void;
}

interface Waiter {
  finish(revision: number): void;
}

const SETTLE_MS = 500;

/** Watch extension output and resolve long-polls after each settled rebuild. */
export function watchBuild(
  directory: string,
  watchDirectory: typeof watch = watch,
): BuildWatcher {
  const waiters = new Set<Waiter>();
  let revision = 0;
  let settle: NodeJS.Timeout | undefined;

  const bump = (): void => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      revision += 1;
      // One line that counts up, rather than a line per save in watch mode.
      log.info(`Extension rebuilt (revision ${revision})`, { replaceKey: 'rebuild' });
      finishWaiters(waiters, revision);
    }, SETTLE_MS);
  };

  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watchDirectory(directory, { recursive: true }, bump);
    watcher.on('error', (cause) => {
      log.warn(`Stopped watching ${directory} for rebuilds: ${cause.message}`);
      watcher?.close();
      watcher = undefined;
      finishWaiters(waiters, revision);
    });
  } catch {
    log.warn(`Not watching ${directory} for rebuilds. Build the extension to enable live reload.`);
  }

  return {
    revision: () => revision,

    waitForChange(since, timeoutMs) {
      if (since !== revision) return Promise.resolve(revision);

      return new Promise((resolve) => {
        const timer = setTimeout(() => finish(revision), timeoutMs);
        const waiter = { finish };

        function finish(next: number): void {
          clearTimeout(timer);
          waiters.delete(waiter);
          resolve(next);
        }
        waiters.add(waiter);
      });
    },

    stop() {
      clearTimeout(settle);
      watcher?.close();
      watcher = undefined;
      finishWaiters(waiters, revision);
    },
  };
}

function finishWaiters(waiters: Set<Waiter>, revision: number): void {
  for (const waiter of waiters) waiter.finish(revision);
  waiters.clear();
}
