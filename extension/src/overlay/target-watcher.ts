import { NOT_PAIRED } from '../lib/daemon.ts';
import { askBackground, isContextAlive } from '../lib/messaging.ts';
import type { Target } from '../lib/protocol.ts';

const REFRESH_INTERVAL_MS = 2_000;

/** Keeps the tray's agent states in sync while design mode is open. */
export interface TargetWatcher {
  start(): void;
  stop(): void;
  /** Record targets loaded interactively so the next poll only reports changes. */
  record(targets: Target[], message?: string): void;
  /** Check immediately, for example after sending a new prompt. */
  refresh(): Promise<void>;
}

/** Poll herdr state without replacing useful tray messages when nothing changed. */
export function createTargetWatcher(
  pageUrl: () => string,
  onChange: (targets: Target[], message?: string) => void,
): TargetWatcher {
  let active = false;
  let inFlight = false;
  let interval: number | null = null;
  let revision = '';
  let stateVersion = 0;

  function record(targets: Target[], message?: string): void {
    revision = targetsRevision(targets, message);
    stateVersion += 1;
  }

  async function refresh(): Promise<void> {
    if (!active || inFlight) return;
    if (!isContextAlive()) {
      stop();
      return;
    }

    inFlight = true;
    const requestVersion = stateVersion;
    try {
      const answer = await askBackground({ kind: 'get-targets', url: pageUrl() });
      if (!active || requestVersion !== stateVersion) return;
      if (!answer.ok) {
        if (answer.error === NOT_PAIRED) onChange([], answer.error);
        return;
      }

      const nextRevision = targetsRevision(answer.value.candidates, answer.value.message);
      if (nextRevision === revision) return;

      record(answer.value.candidates, answer.value.message);
      onChange(answer.value.candidates, answer.value.message);
    } finally {
      inFlight = false;
    }
  }

  function start(): void {
    if (active) return;
    active = true;
    interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
  }

  function stop(): void {
    active = false;
    if (interval !== null) window.clearInterval(interval);
    interval = null;
    stateVersion += 1;
  }

  return { start, stop, record, refresh };
}

function targetsRevision(targets: Target[], message?: string): string {
  return JSON.stringify({ targets, message });
}
