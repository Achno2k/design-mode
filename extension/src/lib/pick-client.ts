import { fail, type Answer } from './messaging.ts';
import type { FollowUpRequest, FollowUpResponse, PickStatusResponse } from './protocol.ts';

/**
 * Follow a sent review through the daemon.
 *
 * Placeholders until the feedback loop lands. Both will go through
 * `daemonRequest` in `daemon.ts`; the status poll is held open by the daemon,
 * so it needs a timeout longer than the default.
 */
export async function fetchPickStatus(_pickId: string, _since: number): Promise<Answer<PickStatusResponse>> {
  return fail('Review status is not available yet.');
}

export async function postFollowUp(_request: FollowUpRequest): Promise<Answer<FollowUpResponse>> {
  return fail('Follow-ups are not available yet.');
}
