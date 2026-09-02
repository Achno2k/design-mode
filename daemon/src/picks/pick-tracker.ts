import type { listAgents as listAgentsCommand } from '../herdr/client.ts';
import type { HerdrAgent } from '../herdr/types.ts';
import { log } from '../logger.ts';
import type { PickStatus } from '../payload/types.ts';

/** Everything the tracker needs to start following a sent review. */
export interface TrackedPickInput {
  pickId: string;
  paneId: string;
  notePath: string;
  /** `agent_session.value` of the agent that was prompted, when herdr reported one. */
  sessionId?: string;
  /** The agent's `state_change_seq` just before the prompt went in. */
  baseSeq: number;
  followUps: number;
}

/** What the tracker currently knows about a review. */
export interface TrackedPick extends TrackedPickInput {
  status: PickStatus;
  /** Bumps on every status change so a long-poll can ask for "anything newer". */
  seq: number;
}

export interface PickTracker {
  /** Follow a review. Re-tracking a known id keeps its status and seq. */
  track(pick: TrackedPickInput): TrackedPick;
  get(pickId: string): TrackedPick | undefined;
  /** Resolve as soon as `seq` moves past `since`, or with the current state on timeout. */
  waitForChange(pickId: string, since: number, timeoutMs: number): Promise<TrackedPick | undefined>;
  /** A follow-up was prompted: start again from `queued` against a fresh base seq. */
  rearm(pickId: string, next: { baseSeq: number; followUps: number }): TrackedPick | undefined;
  stop(): void;
}

export interface PickTrackerOptions {
  listAgents: typeof listAgentsCommand;
  /** How often `herdr agent list` runs while any review is still moving. */
  intervalMs?: number;
  /** How long a finished or lost review stays answerable before it is dropped. */
  liveMs?: number;
  now?: () => number;
}

interface Waiter {
  pickId: string;
  finish(pick: TrackedPick | undefined): void;
}

interface Entry extends TrackedPick {
  /** When the review reached `done` or `lost`, for expiry. */
  settledAt: number | null;
}

const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_LIVE_MS = 10 * 60 * 1_000;

/**
 * Follow sent reviews through herdr's agent list.
 *
 * Pane status alone cannot say "done with *this* review": an agent that is
 * idle may never have started on it. The `state_change_seq` captured before
 * the prompt settles that — the agent has not moved until its seq passes the
 * base — and `agent_session` says whether the pane still holds the same
 * agent at all. Polling runs only while something is unsettled, so an idle
 * daemon never shells out.
 */
export function createPickTracker(options: PickTrackerOptions): PickTracker {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const liveMs = options.liveMs ?? DEFAULT_LIVE_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const waiters = new Set<Waiter>();
  let timer: NodeJS.Timeout | undefined;
  let polling = false;
  let stopped = false;

  function snapshot(entry: Entry): TrackedPick {
    const { settledAt: _settledAt, ...pick } = entry;
    return pick;
  }

  function schedule(): void {
    if (stopped || timer !== undefined) return;
    if (![...entries.values()].some((entry) => entry.settledAt === null)) return;
    timer = setTimeout(() => {
      timer = undefined;
      void poll();
    }, intervalMs);
  }

  async function poll(): Promise<void> {
    if (polling || stopped) return;
    polling = true;
    try {
      const agents = await options.listAgents();
      if (stopped) return;
      if (!agents.ok) {
        // A hiccup in the CLI says nothing about the agents; keep the last status.
        log.warn(`Could not refresh review status: ${agents.error}`);
      } else {
        applyAgents(agents.value);
      }
      dropExpired();
    } finally {
      polling = false;
      schedule();
    }
  }

  function applyAgents(agents: HerdrAgent[]): void {
    const at = now();
    for (const entry of entries.values()) {
      // Done and lost are final: whatever the agent does next is other work.
      if (entry.settledAt !== null) continue;
      const agent = agents.find((candidate) => candidate.pane_id === entry.paneId);
      const next = nextStatus(entry, agent);
      if (next === entry.status) continue;
      entry.status = next;
      entry.seq += 1;
      if (isSettled(next)) entry.settledAt = at;
      finishWaiters(entry.pickId, snapshot(entry));
    }
  }

  function dropExpired(): void {
    for (const pickId of entries.keys()) lookup(pickId);
  }

  /** The entry for `pickId`, dropping it first if it settled too long ago. */
  function lookup(pickId: string): Entry | undefined {
    const entry = entries.get(pickId);
    if (entry === undefined) return undefined;
    if (entry.settledAt !== null && now() - entry.settledAt > liveMs) {
      entries.delete(pickId);
      return undefined;
    }
    return entry;
  }

  function finishWaiters(pickId: string, pick: TrackedPick | undefined): void {
    for (const waiter of waiters) {
      if (waiter.pickId === pickId) waiter.finish(pick);
    }
  }

  return {
    track(pick) {
      const existing = entries.get(pick.pickId);
      if (existing !== undefined) return snapshot(existing);

      const entry: Entry = { ...pick, status: 'queued', seq: 0, settledAt: null };
      entries.set(pick.pickId, entry);
      schedule();
      return snapshot(entry);
    },

    get(pickId) {
      const entry = lookup(pickId);
      return entry === undefined ? undefined : snapshot(entry);
    },

    waitForChange(pickId, since, timeoutMs) {
      const entry = lookup(pickId);
      if (entry === undefined || entry.seq !== since || stopped) {
        return Promise.resolve(entry === undefined ? undefined : snapshot(entry));
      }

      return new Promise((resolve) => {
        const timer = setTimeout(() => finish(snapshot(entry)), timeoutMs);
        const waiter: Waiter = { pickId, finish };

        function finish(pick: TrackedPick | undefined): void {
          clearTimeout(timer);
          waiters.delete(waiter);
          resolve(pick);
        }
        waiters.add(waiter);
      });
    },

    rearm(pickId, next) {
      const entry = entries.get(pickId);
      if (entry === undefined) return undefined;

      entry.baseSeq = next.baseSeq;
      entry.followUps = next.followUps;
      entry.status = 'queued';
      entry.settledAt = null;
      entry.seq += 1;
      finishWaiters(pickId, snapshot(entry));
      schedule();
      return snapshot(entry);
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
      for (const waiter of waiters) {
        const entry = entries.get(waiter.pickId);
        waiter.finish(entry === undefined ? undefined : snapshot(entry));
      }
      waiters.clear();
    },
  };
}

/**
 * Where the agent is with this review, given what herdr says about its pane.
 *
 * `unknown` is herdr saying it cannot classify the agent, not that anything
 * changed, so the last status stands. An idle agent whose seq has moved past
 * the base has been through a turn since the prompt, whether or not a poll
 * happened to catch it working.
 */
function nextStatus(entry: Entry, agent: HerdrAgent | undefined): PickStatus {
  if (agent === undefined) return 'lost';
  if (entry.sessionId !== undefined && agent.agent_session?.value !== entry.sessionId) return 'lost';
  if (agent.state_change_seq <= entry.baseSeq) return 'queued';

  switch (agent.agent_status) {
    case 'working':
      return 'working';
    case 'blocked':
      return 'blocked';
    case 'idle':
    case 'done':
      return 'done';
    case 'unknown':
      return entry.status;
  }
}

function isSettled(status: PickStatus): boolean {
  return status === 'done' || status === 'lost';
}
