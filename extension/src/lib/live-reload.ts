import { BASE_URL } from './daemon.ts';

/** Where the last seen build revision is kept, so a restart is not mistaken for a rebuild. */
const STORAGE_KEY = 'buildRevision';

/** How long to wait before retrying once the daemon has gone away. */
const RETRY_MS = 4_000;
const POLL_TIMEOUT_MS = 35_000;

/**
 * Restart the extension whenever its bundle is rebuilt.
 *
 * Chrome cannot reload an unpacked extension on its own, and doing it by hand
 * also orphans the content scripts on every open page. The daemon already
 * watches the build output, so the service worker holds a request open against
 * it and restarts as soon as something changes — which in turn re-injects the
 * new overlay into open tabs.
 *
 * The loop is what keeps the service worker alive: a request in flight prevents
 * it being shut down, so this never misses a rebuild.
 */
export function startLiveReload(): void {
  void loop();
}

async function loop(): Promise<void> {
  // Rather than the revision it was built at, so the very first poll after an
  // install settles on the current value instead of reloading immediately.
  let since = await readLastRevision();

  for (;;) {
    const revision = await pollOnce(since);

    if (revision === null) {
      await delay(RETRY_MS);
      continue;
    }

    if (since !== null && revision !== since) {
      await writeLastRevision(revision);
      chrome.runtime.reload();
      return;
    }

    await writeLastRevision(revision);
    since = revision;
  }
}

/** The daemon's current build revision, or null when it cannot be reached. */
async function pollOnce(since: number | null): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/build?since=${since ?? -1}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { revision?: unknown };
    return typeof body.revision === 'number' ? body.revision : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLastRevision(): Promise<number | null> {
  try {
    const stored = await chrome.storage.session.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

async function writeLastRevision(revision: number): Promise<void> {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: revision });
  } catch {
    // Live reload is a convenience; storage must never terminate its poll loop.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
