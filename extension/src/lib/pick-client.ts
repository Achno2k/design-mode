import { daemonRequest } from './daemon.ts';
import type { Answer } from './messaging.ts';
import type { FollowUpRequest, FollowUpResponse, PickStatusResponse } from './protocol.ts';

/**
 * The daemon holds a status poll open for up to 25 s before answering with no
 * change, so the client must outlast that or every quiet poll reads as a failure.
 */
const STATUS_TIMEOUT_MS = 35_000;

/** Where the agent is with a sent review; answers once its status moves past `since`. */
export async function fetchPickStatus(pickId: string, since: number): Promise<Answer<PickStatusResponse>> {
  const query = new URLSearchParams({ id: pickId, since: String(since) });
  return daemonRequest<PickStatusResponse>(
    `/pick?${query.toString()}`,
    { cache: 'no-store' },
    { requiresAuth: true, timeoutMs: STATUS_TIMEOUT_MS },
  );
}

/** Add a reply to a sent review's note and prompt its agent again. */
export async function postFollowUp(request: FollowUpRequest): Promise<Answer<FollowUpResponse>> {
  return daemonRequest<FollowUpResponse>(
    '/pick/follow-up',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
    { requiresAuth: true },
  );
}
