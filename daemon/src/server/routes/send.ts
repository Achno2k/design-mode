import { listAgents, sendPrompt } from '../../herdr/client.ts';
import type { HerdrAgent } from '../../herdr/types.ts';
import { log } from '../../logger.ts';
import { parseSendRequest } from '../../payload/parse.ts';
import { writePickRecord } from '../../payload/pick-record.ts';
import { renderPrompt } from '../../payload/render.ts';
import type { SendResponse } from '../../payload/types.ts';
import { writePick, type WrittenPick } from '../../payload/writer.ts';
import type { PickTracker } from '../../picks/pick-tracker.ts';
import { resolveProjectScope } from '../../resolve/scope.ts';
import { rankTargets } from '../../resolve/target.ts';
import { json, type RouteContext, type RouteResult } from '../router.ts';

interface SendDependencies {
  listAgents: typeof listAgents;
  sendPrompt: typeof sendPrompt;
  writePick: typeof writePick;
  writePickRecord: typeof writePickRecord;
  resolveProjectScope: typeof resolveProjectScope;
  rankTargets: typeof rankTargets;
  now: () => Date;
}

const defaultDependencies: SendDependencies = {
  listAgents,
  sendPrompt,
  writePick,
  writePickRecord,
  resolveProjectScope,
  rankTargets,
  now: () => new Date(),
};

/**
 * Write a review to disk and hand it to the chosen agent.
 *
 * The pane is checked against the live agent list first. Pane ids are reused
 * conceptually but not literally, so a stale one from a popup left open would
 * otherwise send a prompt into whatever now occupies that slot.
 */
export function createSendHandler(tracker: PickTracker, overrides: Partial<SendDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function handleSend({ readJson }: RouteContext): Promise<RouteResult> {
    const body = await readJson();
    if (!body.ok) return json(400, { error: body.error });

    const request = parseSendRequest(body.value);
    if (!request.ok) return json(400, { error: request.error });

    const agents = await dependencies.listAgents();
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

    const ownsProject = await targetOwnsProject(target, request.value, dependencies);
    if (!ownsProject) {
      return json(409, {
        error: `That agent is not working in the project behind ${request.value.url}. Refresh the targets and pick again.`,
      });
    }

    const sentAt = dependencies.now();
    const pick = await dependencies.writePick(request.value, sentAt);
    if (!pick.ok) return json(500, { error: pick.error });

    const prompt = renderPrompt(
      pick.value.notePath,
      request.value.selections.length,
      request.value.url,
      pick.value.hasScreenshots,
      countPages(request.value),
    );
    const sent = await dependencies.sendPrompt(request.value.paneId, prompt);
    if (!sent.ok) {
      return json(502, { error: `Wrote ${pick.value.notePath} but could not reach the agent: ${sent.error}` });
    }

    log.info(`Sent ${request.value.selections.length} selection(s) to ${request.value.paneId}`);
    await follow(tracker, target, pick.value, sentAt, dependencies);

    return json(200, {
      pickId: pick.value.pickId,
      notePath: pick.value.notePath,
      paneId: request.value.paneId,
    } satisfies SendResponse);
  };
}

/**
 * Start following the review. The base seq is the agent's seq from the same
 * list that validated the pane, so a state change caused by the prompt itself
 * cannot be missed. The record on disk is what survives a daemon restart; a
 * failure to write it costs recovery, not the review, so it is only logged.
 */
async function follow(
  tracker: PickTracker,
  target: HerdrAgent,
  pick: WrittenPick,
  sentAt: Date,
  dependencies: SendDependencies,
): Promise<void> {
  const sessionId = target.agent_session?.value;
  const tracked = {
    pickId: pick.pickId,
    paneId: target.pane_id,
    notePath: pick.notePath,
    ...(sessionId === undefined ? {} : { sessionId }),
    baseSeq: target.state_change_seq,
    followUps: 0,
  };
  tracker.track(tracked);

  const written = await dependencies.writePickRecord(pick.directory, {
    ...tracked,
    sentAt: sentAt.toISOString(),
  });
  if (!written.ok) log.warn(written.error);
}

async function targetOwnsProject(
  target: HerdrAgent,
  request: { url: string },
  dependencies: SendDependencies,
): Promise<boolean> {
  const project = await dependencies.resolveProjectScope(request.url);
  if (!project.ok) return true;

  const candidates = await dependencies.rankTargets([target], project.value.scope);
  return candidates.ok && candidates.value.length === 1;
}

function countPages(request: { url: string; pageNotes?: { url: string }[]; selections: { pageUrl?: string }[] }): number {
  const pages = new Set([
    ...request.selections.flatMap((selection) =>
      selection.pageUrl === undefined ? [] : [selection.pageUrl],
    ),
    ...(request.pageNotes ?? []).map((note) => note.url),
  ]);
  if (pages.size === 0 || request.selections.some((selection) => selection.pageUrl === undefined)) {
    pages.add(request.url);
  }
  return pages.size;
}
