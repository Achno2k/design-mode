import { NOT_RUNNING, TIMED_OUT } from '../lib/daemon.ts';
import { askBackground, isContextAlive, type SentPick } from '../lib/messaging.ts';
import type { PickStatusResponse } from '../lib/protocol.ts';

/** How long to wait before asking again once the daemon has gone away. */
const RETRY_MS = 4_000;

/** Follows one sent review until its agent is done with it, or has left. */
export interface PickStatusWatcher {
  /** Start following `pick`; replaces whatever was being followed before. */
  start(pick: SentPick): void;
  stop(): void;
}

export interface PickStatusWatcherHandlers {
  onChange(status: PickStatusResponse): void;
  /** The daemon refused to answer for this review; it will not be asked again. */
  onError(message: string): void;
}

/**
 * Long-poll the daemon for one review's status.
 *
 * The daemon answers as soon as something changes, so the loop is mostly one
 * request held open at a time. A daemon that is away is retried, because it is
 * usually being restarted and picks up the review again from disk. Any other
 * refusal is final: the review is gone, and polling would only repeat the error.
 */
export function createPickStatusWatcher(handlers: PickStatusWatcherHandlers): PickStatusWatcher {
  let generation = 0;

  async function follow(pick: SentPick, mine: number): Promise<void> {
    let since = pick.seq;

    for (;;) {
      if (mine !== generation || !isContextAlive()) return;

      const answer = await askBackground({ kind: 'pick-status', pickId: pick.pickId, since });
      if (mine !== generation) return;

      if (!answer.ok) {
        if (!isRetryable(answer.error)) {
          handlers.onError(answer.error);
          return;
        }
        await delay(RETRY_MS);
        continue;
      }

      if (answer.value.seq !== since) {
        since = answer.value.seq;
        handlers.onChange(answer.value);
      }
      if (answer.value.status === 'done' || answer.value.status === 'lost') return;
    }
  }

  return {
    start(pick) {
      generation += 1;
      void follow(pick, generation);
    },
    stop() {
      generation += 1;
    },
  };
}

function isRetryable(error: string): boolean {
  return error === NOT_RUNNING || error === TIMED_OUT;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
