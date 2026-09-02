import type { BuildWatcher } from '../../build-watch.ts';
import type { PickTracker } from '../../picks/pick-tracker.ts';
import { json, type RouteTable } from '../router.ts';
import { handleBlob } from './blob.ts';
import { createBuildRoute } from './build.ts';
import { createFollowUpHandler, createPickStatusHandler } from './pick.ts';
import { createSendHandler } from './send.ts';
import { handleTargets } from './targets.ts';

/** Build the routing table. Dependencies are passed in rather than reached for. */
export function createRoutes(watcher: BuildWatcher, token: string, picks: PickTracker): RouteTable {
  return {
    'GET /health': async () => json(200, { ok: true, protocol: 3, tokenHint: token.slice(0, 4) }),
    'GET /targets': handleTargets,
    'POST /blob': handleBlob,
    'POST /send': createSendHandler(picks),
    'GET /build': createBuildRoute(watcher),
    'GET /pick': createPickStatusHandler(picks),
    'POST /pick/follow-up': createFollowUpHandler(picks),
  };
}
