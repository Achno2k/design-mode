import { dirname } from 'node:path';

import { config } from '../../config.ts';
import { listAgents, sendPrompt } from '../../herdr/client.ts';
import { log } from '../../logger.ts';
import { appendFollowUp, renderFollowUpPrompt } from '../../payload/follow-up.ts';
import { isRecord, readString } from '../../payload/parse-primitives.ts';
import { isPickId, readPickRecord, writePickRecord } from '../../payload/pick-record.ts';
import type { FollowUpResponse, PickStatusResponse } from '../../payload/types.ts';
import type { PickTracker, TrackedPick } from '../../picks/pick-tracker.ts';
import { err, ok, type Result } from '../../result.ts';
import { json, requireParam, type RouteContext, type RouteResult } from '../router.ts';

interface PickDependencies {
  tracker: PickTracker;
  listAgents: typeof listAgents;
  sendPrompt: typeof sendPrompt;
  readPickRecord: typeof readPickRecord;
  writePickRecord: typeof writePickRecord;
  appendFollowUp: typeof appendFollowUp;
  pollMs: number;
}

const defaultDependencies: Omit<PickDependencies, 'tracker'> = {
  listAgents,
  sendPrompt,
  readPickRecord,
  writePickRecord,
  appendFollowUp,
  pollMs: config.buildPollMs,
};

/**
 * `GET /pick?id=&since=`: where the agent is with a sent review.
 *
 * Held open until the status moves past `since`, like the build poll, so the
 * tray reflects a change within one herdr poll rather than one browser poll.
 */
export function createPickStatusHandler(
  tracker: PickTracker,
  overrides: Partial<Omit<PickDependencies, 'tracker'>> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides, tracker };

  return async function handlePickStatus({ url }: RouteContext): Promise<RouteResult> {
    const pickId = requireParam(url, 'id');
    if (pickId === null || !isPickId(pickId)) return json(400, { error: 'A valid review id is required.' });
    const since = Number(url.searchParams.get('since') ?? '-1');

    const known = await findPick(pickId, dependencies);
    if (!known.ok) return json(404, { error: known.error });

    const pick = await tracker.waitForChange(pickId, Number.isFinite(since) ? since : -1, dependencies.pollMs);
    return json(200, toStatusResponse(pick ?? known.value));
  };
}

/**
 * `POST /pick/follow-up`: append a reply to the note and prompt the agent again.
 *
 * The pane is checked against the live list, and against the session that
 * received the original review, before anything is typed into it.
 */
export function createFollowUpHandler(
  tracker: PickTracker,
  overrides: Partial<Omit<PickDependencies, 'tracker'>> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides, tracker };

  return async function handleFollowUp({ readJson }: RouteContext): Promise<RouteResult> {
    const body = await readJson();
    if (!body.ok) return json(400, { error: body.error });
    const request = parseFollowUpRequest(body.value);
    if (!request.ok) return json(400, { error: request.error });

    const known = await findPick(request.value.pickId, dependencies);
    if (!known.ok) return json(404, { error: known.error });
    const pick = known.value;

    const agents = await dependencies.listAgents();
    if (!agents.ok) return json(502, { error: agents.error });
    const agent = agents.value.find((candidate) => candidate.pane_id === pick.paneId);
    if (agent === undefined || (pick.sessionId !== undefined && agent.agent_session?.value !== pick.sessionId)) {
      return json(409, {
        error: `Pane ${pick.paneId} no longer has the agent that received this review. Send it as a new review instead.`,
      });
    }
    if (agent.agent_status === 'blocked') {
      return json(409, {
        error: `Pane ${pick.paneId} is currently blocked in herdr. Resolve the block in that pane, then send the reply again.`,
      });
    }

    const appended = await dependencies.appendFollowUp(pick.notePath, request.value.comment);
    if (!appended.ok) return json(500, { error: appended.error });

    const sent = await dependencies.sendPrompt(pick.paneId, renderFollowUpPrompt(pick.notePath, appended.value));
    if (!sent.ok) {
      return json(502, { error: `Added the reply to ${pick.notePath} but could not reach the agent: ${sent.error}` });
    }

    tracker.rearm(pick.pickId, { baseSeq: agent.state_change_seq, followUps: appended.value });
    await rememberFollowUp(pick, appended.value, dependencies);
    log.info(`Sent follow-up ${appended.value} for ${pick.pickId} to ${pick.paneId}`);

    return json(200, {
      pickId: pick.pickId,
      followUp: appended.value,
      notePath: pick.notePath,
    } satisfies FollowUpResponse);
  };
}

/**
 * The tracker's view of a review, rehydrated from `pick.json` when the daemon
 * was restarted since it was sent.
 */
async function findPick(pickId: string, dependencies: PickDependencies): Promise<Result<TrackedPick>> {
  const tracked = dependencies.tracker.get(pickId);
  if (tracked !== undefined) return ok(tracked);

  const record = await dependencies.readPickRecord(pickId);
  if (!record.ok) return record;
  if (record.value === null) {
    return err(`Review ${pickId} was not found. It may have been sent to another daemon or cleaned up.`);
  }
  return ok(dependencies.tracker.track(record.value));
}

/** Keep `pick.json` in step so a restart does not forget the reply count. */
async function rememberFollowUp(
  pick: TrackedPick,
  followUps: number,
  dependencies: PickDependencies,
): Promise<void> {
  const record = await dependencies.readPickRecord(pick.pickId);
  if (!record.ok || record.value === null) return;

  const written = await dependencies.writePickRecord(dirname(pick.notePath), { ...record.value, followUps });
  if (!written.ok) log.warn(written.error);
}

function parseFollowUpRequest(value: unknown): Result<{ pickId: string; comment: string }> {
  if (!isRecord(value)) return err('The follow-up body must be an object.');
  const pickId = readString(value.pickId);
  if (pickId === null || !isPickId(pickId)) return err('A valid review id is required.');
  const comment = readString(value.comment);
  if (comment === null) return err('Write something in the reply before sending it.');
  return ok({ pickId, comment });
}

function toStatusResponse(pick: TrackedPick): PickStatusResponse {
  return {
    pickId: pick.pickId,
    paneId: pick.paneId,
    status: pick.status,
    seq: pick.seq,
    followUps: pick.followUps,
    notePath: pick.notePath,
  };
}
