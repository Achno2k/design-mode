import type { BuildWatcher } from '../../build-watch.ts';
import { json, type RouteTable } from '../router.ts';
import { createBuildRoute } from './build.ts';
import { handleSend } from './send.ts';
import { handleTargets } from './targets.ts';

/** Build the routing table. Dependencies are passed in rather than reached for. */
export function createRoutes(watcher: BuildWatcher): RouteTable {
  return {
    'GET /health': async () => json(200, { ok: true }),
    'GET /targets': handleTargets,
    'POST /send': handleSend,
    'GET /build': createBuildRoute(watcher),
  };
}
