import { askBackground, type SentPick } from '../lib/messaging.ts';
import type { PickStatusResponse } from '../lib/protocol.ts';
import type { Composer } from './composer.ts';
import { createOutlines } from './outlines.ts';
import { createPickStatusWatcher } from './pick-status-watcher.ts';
import { findSentItems } from './reload-and-show.ts';
import type { ReviewSessionState } from './review-session.ts';
import type { Tray } from './tray.ts';

/** What happens to a review after it has been sent. */
export interface PickFollow {
  /** A review was just delivered: show its row and start following it. */
  onSent(pick: SentPick): void;
  /** A session came back after navigation: pick up where the follow left off. */
  resume(): void;
  /** Stop polling and drop the outlines; the session state is left alone. */
  stop(): void;
  reloadAndShow(): Promise<void>;
  openReply(): void;
}

export interface PickFollowDeps {
  layer: HTMLElement;
  tray: Tray;
  composer: Composer;
  reviewSession: ReviewSessionState;
  isPicking(): boolean;
  /** Ask herdr for agent states again, since a prompt just changed one. */
  refreshTargets(): void;
  /** Take the hover box away before a panel opens somewhere unrelated. */
  hideHighlight(): void;
}

/**
 * Close the loop on a sent review.
 *
 * The tray row follows the agent through the daemon's status poll, "Reload and
 * show" comes back with the sent elements outlined, and "Reply" adds to the
 * same note instead of starting a review over. All of it hangs off
 * `reviewSession.lastPick`, which is what survives the reload in between.
 */
export function createPickFollow(deps: PickFollowDeps): PickFollow {
  const { tray, composer, reviewSession } = deps;
  const outlines = createOutlines(deps.layer);
  const watcher = createPickStatusWatcher({ onChange: onStatus, onError: onLost });

  function show(): void {
    const pick = reviewSession.lastPick();
    tray.setPickStatus(
      pick === null
        ? null
        : {
            paneId: pick.paneId,
            status: pick.status,
            followUps: pick.followUps,
            itemCount: pick.items.length,
          },
    );
  }

  function remember(pick: SentPick): Promise<void> {
    return reviewSession.setLastPick(pick, deps.isPicking());
  }

  /** Keep polling while the agent may still be on the review. */
  function follow(): void {
    const pick = reviewSession.lastPick();
    if (pick === null || pick.status === 'done' || pick.status === 'lost') return;
    watcher.start(pick);
  }

  function onStatus(status: PickStatusResponse): void {
    const pick = reviewSession.lastPick();
    if (pick === null || pick.pickId !== status.pickId) return;

    void remember({ ...pick, status: status.status, seq: status.seq, followUps: status.followUps });
    show();
    if (status.status === 'done') tray.setStatus(`${pick.paneId} finished the review.`, 'success');
    else if (status.status === 'lost') tray.setStatus(`${pick.paneId} no longer has that agent.`, 'error');
    else if (status.status === 'blocked') tray.setStatus(`${pick.paneId} is blocked in herdr.`, 'error');
  }

  /** The daemon no longer knows the review; there is nothing left to follow. */
  function onLost(message: string): void {
    const pick = reviewSession.lastPick();
    if (pick === null) return;
    void remember({ ...pick, status: 'lost' });
    show();
    tray.setStatus(message, 'error');
  }

  function showSentItems(): void {
    const pick = reviewSession.lastPick();
    if (pick === null) return;
    void remember({ ...pick, showOnReload: false });

    const { found, total } = findSentItems(pick.items, window.location.href);
    outlines.show(found);
    if (total === 0) {
      tray.setStatus('None of the sent items belong to this page.', 'busy');
    } else {
      tray.setStatus(`Showing ${found.length} of ${total} sent item${total === 1 ? '' : 's'}.`, 'success');
    }
  }

  async function sendReply(pickId: string, comment: string): Promise<void> {
    tray.setStatus('Sending reply…', 'busy');
    const answer = await askBackground({ kind: 'follow-up', request: { pickId, comment } });
    if (!answer.ok) {
      tray.setStatus(answer.error, 'error');
      return;
    }

    const pick = reviewSession.lastPick();
    if (pick === null || pick.pickId !== pickId) return;
    outlines.hide();
    // Back to queued against a seq the watcher has not seen, so its first poll
    // answers at once with whatever the daemon knows now.
    void remember({
      ...pick,
      status: 'queued',
      seq: -1,
      followUps: answer.value.followUp,
      showOnReload: false,
    });
    show();
    follow();
    tray.setStatus(`Reply ${answer.value.followUp} sent to ${pick.paneId}.`, 'success');
    deps.refreshTargets();
  }

  return {
    onSent(pick) {
      outlines.hide();
      void remember(pick);
      show();
      follow();
    },

    resume() {
      show();
      follow();
      if (reviewSession.lastPick()?.showOnReload === true) showSentItems();
    },

    stop() {
      watcher.stop();
      outlines.hide();
    },

    /**
     * The session is awaited into extension storage before reloading: a reload
     * that outran the write would come back not knowing it should show anything.
     */
    async reloadAndShow() {
      const pick = reviewSession.lastPick();
      if (pick === null) return;
      tray.setStatus('Reloading…', 'busy');
      await remember({ ...pick, showOnReload: true });
      window.location.reload();
    },

    openReply() {
      const pick = reviewSession.lastPick();
      if (pick === null) return;
      if (pick.status === 'lost') {
        tray.setStatus('That agent is gone. Send a new review instead.', 'error');
        return;
      }

      deps.hideHighlight();
      composer.openAt(
        tray.pickRowBox(),
        { tag: 'Reply', detail: pick.paneId },
        (draft) => void sendReply(pick.pickId, draft.comment),
        () => undefined,
      );
    },
  };
}
