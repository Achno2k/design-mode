import { json, type RouteContext, type RouteResult } from '../router.ts';

/**
 * Follow a sent review: `GET /pick?id=&since=` long-polls its agent's status and
 * `POST /pick/follow-up` appends a reply to the note and prompts the agent again.
 *
 * Both are placeholders until the feedback loop lands; the routes exist now so
 * the protocol version and the extension's client can be settled first.
 */
export async function handlePickStatus(_context: RouteContext): Promise<RouteResult> {
  return json(501, { error: 'Review status is not available in this daemon yet.' });
}

export async function handleFollowUp(_context: RouteContext): Promise<RouteResult> {
  return json(501, { error: 'Follow-ups are not available in this daemon yet.' });
}
