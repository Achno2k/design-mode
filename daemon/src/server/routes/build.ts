import type { BuildWatcher } from '../../build-watch.ts';
import { config } from '../../config.ts';
import { json, type RouteContext, type RouteResult } from '../router.ts';

/**
 * Tell the extension when its bundle has been rebuilt.
 *
 * The request is held open until something changes, so a rebuild reaches the
 * browser immediately instead of on the next poll. A service worker with a
 * request in flight also stays awake, which is what makes this workable in
 * manifest v3 at all.
 */
export function createBuildRoute(watcher: BuildWatcher) {
  return async ({ url }: RouteContext): Promise<RouteResult> => {
    const since = Number(url.searchParams.get('since') ?? '-1');
    const seen = Number.isFinite(since) ? since : -1;

    const revision = await watcher.waitForChange(seen, config.buildPollMs);
    return json(200, { revision, changed: revision !== seen });
  };
}
