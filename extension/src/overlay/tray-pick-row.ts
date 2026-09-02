import type { PickStatus } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';

/** What the row says about the review that was last sent. */
export interface PickStatusView {
  paneId: string;
  status: PickStatus;
  followUps: number;
}

export interface PickRow {
  element: HTMLElement;
  /** Show the state of a sent review, or hide the row with `null`. */
  set(view: PickStatusView | null): void;
}

export interface PickRowHandlers {
  onReloadAndShow(): void;
  onReply(): void;
}

/**
 * The line under the agent picker that follows a sent review.
 *
 * Renders a status dot and a sentence for now; the actions arrive with the
 * feedback loop, which is also what will start feeding it real status.
 */
export function createPickRow(_handlers: PickRowHandlers): PickRow {
  const dot = make('span', { className: 'dot dot--idle' });
  const text = make('span', { className: 'pick-row__text' });
  const element = fill(make('div', { className: 'pick-row', attributes: { hidden: '' } }), dot, text);

  return {
    element,
    set(view) {
      if (view === null) {
        element.setAttribute('hidden', '');
        return;
      }
      dot.className = `dot dot--${view.status === 'lost' ? 'unknown' : view.status}`;
      text.textContent = `${view.paneId} · ${describeStatus(view.status)}`;
      text.title = text.textContent;
      element.removeAttribute('hidden');
    },
  };
}

function describeStatus(status: PickStatus): string {
  switch (status) {
    case 'queued':
      return 'review queued';
    case 'working':
      return 'working on the review…';
    case 'blocked':
      return 'blocked, needs you in herdr';
    case 'done':
      return 'done';
    case 'lost':
      return 'agent no longer in that pane';
  }
}
