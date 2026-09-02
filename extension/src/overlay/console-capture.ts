import { askBackground } from '../lib/messaging.ts';
import { countConsoleEntries, createConsoleLog } from './console-log.ts';
import type { ReviewSessionState } from './review-session.ts';
import type { Tray } from './tray.ts';

/** Console capture as the tray's toggle sees it. */
export interface ConsoleCapture {
  /** Turn collection on or off. */
  toggle(): Promise<void>;
  /** Re-arm the hook after a navigation replaced the page. */
  restore(): Promise<void>;
  /** Drop what was collected and keep listening. */
  clear(): void;
  /** End collection with the review session. */
  end(): void;
  /** Drop the listener without touching the stored review. */
  detach(): void;
}

export interface ConsoleCaptureDeps {
  tray: Tray;
  reviewSession: ReviewSessionState;
  isPicking(): boolean;
}

/**
 * Keep the console errors a review should carry.
 *
 * The hook itself lives in the page's own world and survives until the page is
 * replaced, so the toggle is really about listening: turning it off leaves the
 * page hooked and simply stops keeping what it reports. A full-page navigation
 * does destroy it, which is why `restore` installs it again.
 */
export function createConsoleCapture(deps: ConsoleCaptureDeps): ConsoleCapture {
  const { tray, reviewSession } = deps;

  const log = createConsoleLog((entries) => {
    reviewSession.setConsoleErrors(entries, deps.isPicking());
    show();
  });

  function show(): void {
    tray.setConsoleCapture(
      reviewSession.isConsoleCapture(),
      countConsoleEntries(reviewSession.consoleErrors()),
    );
  }

  /**
   * Install the hook, then start listening.
   *
   * The toggle only goes on once the page has accepted the injection: a tray
   * that says it is capturing while nothing is being captured is worse than a
   * toggle that refuses to move.
   */
  async function arm(announce: boolean): Promise<void> {
    const answer = await askBackground({ kind: 'install-console-hook' });
    if (!answer.ok) {
      log.stop();
      reviewSession.setConsoleCapture(false, deps.isPicking());
      show();
      tray.setStatus(answer.error, 'error');
      return;
    }

    log.start(reviewSession.consoleErrors());
    reviewSession.setConsoleCapture(true, deps.isPicking());
    show();
    if (announce) tray.setStatus('Capturing console errors.', 'idle');
  }

  return {
    async toggle() {
      if (!reviewSession.isConsoleCapture()) {
        tray.setStatus('Watching the console…', 'busy');
        await arm(true);
        return;
      }

      log.stop();
      reviewSession.setConsoleCapture(false, deps.isPicking());
      show();
      tray.setStatus('Console errors are no longer captured.', 'idle');
    },

    async restore() {
      if (reviewSession.isConsoleCapture()) await arm(false);
      else show();
    },

    clear() {
      log.clear();
      reviewSession.setConsoleErrors([], deps.isPicking());
      show();
    },

    end() {
      log.stop();
      log.clear();
      reviewSession.setConsoleCapture(false, deps.isPicking());
      reviewSession.setConsoleErrors([], deps.isPicking());
      tray.setConsoleCapture(false, 0);
    },

    detach: () => log.stop(),
  };
}
