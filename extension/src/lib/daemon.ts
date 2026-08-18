import { fail, ok, type Answer } from './messaging.ts';
import type { SendRequest, SendResponse, TargetsResponse } from './protocol.ts';

/** Must match `port` in `daemon/src/config.ts`. */
export const BASE_URL = 'http://127.0.0.1:8791';

const NOT_RUNNING =
  'The design-mode daemon is not running. Start it with `npm run dev` in a herdr pane.';

/**
 * Calls to the daemon.
 *
 * Only the background service worker imports this: content scripts run in the
 * page's origin and would need CORS, whereas the worker has host permissions.
 */

/** Which herdr agents could act on `pageUrl`. */
export async function fetchTargets(pageUrl: string): Promise<Answer<TargetsResponse>> {
  return request<TargetsResponse>(`/targets?url=${encodeURIComponent(pageUrl)}`);
}

/** Deliver a review to the chosen agent. */
export async function postSend(body: SendRequest): Promise<Answer<SendResponse>> {
  return request<SendResponse>('/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Whether the daemon is up, for the popup's status line. */
export async function checkHealth(): Promise<Answer<true>> {
  const answer = await request<{ ok: boolean }>('/health');
  return answer.ok ? ok(true) : answer;
}

async function request<T>(path: string, init?: RequestInit): Promise<Answer<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    return fail(NOT_RUNNING);
  }

  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!response.ok) {
    return fail(body?.error ?? `The daemon replied with ${response.status}.`);
  }
  if (body === null) {
    return fail('The daemon sent a response that could not be read.');
  }
  return ok(body);
}
