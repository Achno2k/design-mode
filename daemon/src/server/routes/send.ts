import { listAgents, sendPrompt } from '../../herdr/client.ts';
import { log } from '../../logger.ts';
import { parseSendRequest } from '../../payload/parse.ts';
import { renderPrompt } from '../../payload/render.ts';
import type { SendResponse } from '../../payload/types.ts';
import { writePick } from '../../payload/writer.ts';
import { json, type RouteContext, type RouteResult } from '../router.ts';

interface SendDeps {
  listAgents: typeof listAgents;
  sendPrompt: typeof sendPrompt;
  writePick: typeof writePick;
}

/**
 * Write a review to disk and hand it to the chosen agent.
 *
 * The pane is checked against the live agent list first. Pane ids are reused
 * conceptually but not literally, so a stale one from a popup left open would
 * otherwise send a prompt into whatever now occupies that slot.
 */
export function createSendHandler(deps: SendDeps = { listAgents, sendPrompt, writePick }) {
  return async function handleSend({ readJson }: RouteContext): Promise<RouteResult> {
    const body = await readJson();
    if (!body.ok) return json(400, { error: body.error });

    const request = parseSendRequest(body.value);
    if (!request.ok) return json(400, { error: request.error });

    const agents = await deps.listAgents();
    if (!agents.ok) return json(502, { error: agents.error });

    const target = agents.value.find((agent) => agent.pane_id === request.value.paneId);
    if (target === undefined) {
      return json(409, {
        error: `Pane ${request.value.paneId} no longer has an agent in it. Pick another one.`,
      });
    }
    if (target.agent_status === 'blocked') {
      return json(409, {
        error: `Pane ${request.value.paneId} is currently blocked in herdr. Resolve the block in that pane or pick another agent, then resend the review.`,
      });
    }

    const pick = await deps.writePick(request.value, new Date());
    if (!pick.ok) return json(500, { error: pick.error });

    const prompt = renderPrompt(
      pick.value.notePath,
      request.value.selections.length,
      request.value.url,
      pick.value.hasScreenshots,
    );
    const sent = await deps.sendPrompt(request.value.paneId, prompt);
    if (!sent.ok) {
      return json(502, { error: `Wrote ${pick.value.notePath} but could not reach the agent: ${sent.error}` });
    }

    log.info(`Sent ${request.value.selections.length} selection(s) to ${request.value.paneId}`);

    return json(200, {
      pickId: pick.value.pickId,
      notePath: pick.value.notePath,
      paneId: request.value.paneId,
    } satisfies SendResponse);
  };
}

export const handleSend = createSendHandler();
