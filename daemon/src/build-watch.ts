import { watch } from 'node:fs';

import { log } from './logger.ts';

/** Tracks rebuilds of the extension so the browser can pick them up on its own. */
export interface BuildWatcher {
  /** Increments on every rebuild. Compared by the extension against its last seen value. */
  revision(): number;
  /** Resolve as soon as the revision moves past `since`, or on timeout. */
  waitForChange(since: number, timeoutMs: number): Promise<number>;
  stop(): void;
}

/**
 * How long the directory must be quiet before a rebuild counts as finished.
 *
 * A build clears the folder, writes the bundles, then copies the static files,
 * and those bursts are far enough apart that a short window reports one build
 * as several — which would restart the extension repeatedly.
 */
const SETTLE_MS = 500;

/**
 * Watch the extension's build output.
 *
 * This exists purely for the development loop. Chrome cannot hot-reload an
 * extension by itself, so the daemon — which is already running and already
 * trusted by the extension — reports when the bundle changed and lets the
 * service worker restart itself.
 */
export function watchBuild(directory: string): BuildWatcher {
  const waiters = new Set<(revision: number) => void>();
  let revision = 0;
  let settle: NodeJS.Timeout | undefined;

  const bump = (): void => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      revision += 1;
      log.info(`Extension rebuilt (revision ${revision})`);

      for (const notify of waiters) notify(revision);
      waiters.clear();
    }, SETTLE_MS);
  };

  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(directory, { recursive: true }, bump);
  } catch {
    // The extension may simply not be built yet; live reload is a convenience,
    // never a requirement for the daemon to run.
    log.warn(`Not watching ${directory} for rebuilds — build the extension to enable live reload.`);
  }

  return {
    revision: () => revision,

    waitForChange(since, timeoutMs) {
      if (since !== revision) return Promise.resolve(revision);

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiters.delete(notify);
          resolve(revision);
        }, timeoutMs);

        function notify(next: number): void {
          clearTimeout(timer);
          resolve(next);
        }
        waiters.add(notify);
      });
    },

    stop() {
      clearTimeout(settle);
      watcher?.close();
      waiters.clear();
    },
  };
}
