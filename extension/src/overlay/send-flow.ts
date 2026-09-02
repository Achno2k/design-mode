import { askBackground, type SentPick } from '../lib/messaging.ts';
import type { Selection } from '../lib/protocol.ts';
import type { ReviewSessionState } from './review-session.ts';
import { confirmTargetReady } from './target-readiness.ts';
import type { Tray } from './tray.ts';

export interface SendFlow {
  send(): Promise<void>;
  /** Forget a "send again to queue" confirmation; the review or target changed. */
  invalidate(): void;
}

export interface SendFlowDeps {
  tray: Tray;
  reviewSession: ReviewSessionState;
  selections: Selection[];
  currentUrl(): string;
  loadTargets(status?: string): Promise<boolean>;
  onSent(pick: SentPick): void;
}

/**
 * Deliver the review to the chosen agent.
 *
 * Targets are refreshed right before sending so the pane is checked against
 * herdr's current state, and a working agent needs a second press to confirm
 * that queuing behind it is intended.
 */
export function createSendFlow(deps: SendFlowDeps): SendFlow {
  const { tray, reviewSession, selections } = deps;
  let confirmedWorkingPaneId: string | null = null;
  let sending = false;

  function hasSendableContent(): boolean {
    return selections.length > 0 || reviewSession.pageNotes().length > 0;
  }

  async function send(): Promise<void> {
    if (sending || !hasSendableContent()) return;

    const requestedPaneId = tray.selectedPaneId();
    if (requestedPaneId === null) return;

    sending = true;
    try {
      const refreshed = await deps.loadTargets('Refreshing targets before send…');
      if (!refreshed) return;

      const target = tray.selectedTarget();
      if (target === null || target.paneId !== requestedPaneId) {
        confirmedWorkingPaneId = null;
        tray.setStatus('That target is no longer available — choose another.', 'error');
        return;
      }
      const ready = confirmTargetReady(
        target,
        confirmedWorkingPaneId,
        (paneId) => (confirmedWorkingPaneId = paneId),
        (message, tone) => tray.setStatus(message, tone),
      );
      if (!ready) return;

      if (!hasSendableContent()) {
        tray.setStatus('Nothing to send.', 'idle');
        return;
      }
      tray.setStatus(target.status === 'unknown' ? 'Status unknown — sending anyway…' : 'Sending…', 'busy');

      const url = deps.currentUrl();
      const consoleErrors = reviewSession.consoleErrors();
      const answer = await askBackground({
        kind: 'send',
        request: {
          url,
          paneId: target.paneId,
          pageNotes: reviewSession.pageNotes(),
          selections,
          ...(consoleErrors.length === 0 ? {} : { consoleErrors }),
        },
      });
      if (!answer.ok) {
        tray.setStatus(answer.error, 'error');
        return;
      }

      deps.onSent({
        pickId: answer.value.pickId,
        paneId: answer.value.paneId,
        notePath: answer.value.notePath,
        sentAt: Date.now(),
        status: 'queued',
        seq: -1,
        followUps: 0,
        showOnReload: false,
        items: sentItems(selections, url),
      });
    } finally {
      sending = false;
    }
  }

  return {
    send,
    invalidate: () => {
      confirmedWorkingPaneId = null;
    },
  };
}

/** Only elements can be found again; drawings have no anchor on the page. */
function sentItems(selections: Selection[], fallbackUrl: string): SentPick['items'] {
  return selections.flatMap((selection) => {
    if (selection.kind !== 'element') return [];
    return [
      {
        selector: selection.selector,
        pageUrl: selection.pageUrl ?? fallbackUrl,
        ...(selection.path === undefined ? {} : { path: selection.path }),
        ...(selection.frame === undefined ? {} : { frame: selection.frame }),
      },
    ];
  });
}
