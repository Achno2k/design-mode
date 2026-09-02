import type { PickStatus } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';

/** What the row says about the review that was last sent. */
export interface PickStatusView {
  paneId: string;
  status: PickStatus;
  followUps: number;
  /** Elements that could be outlined again after a reload; drawings do not count. */
  itemCount?: number;
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
 * A status dot and a sentence, plus the two things worth doing about it:
 * reloading to see what the agent changed, with the sent elements outlined,
 * and replying without starting a new review. Reply is hidden once the pane
 * has lost its agent, since the daemon would refuse it anyway.
 */
export function createPickRow(handlers: PickRowHandlers): PickRow {
  const dot = make('span', { className: 'dot dot--idle' });
  const text = make('span', { className: 'pick-row__text' });
  const reload = make('button', {
    className: 'pill pick-row__action',
    text: 'Reload and show',
    attributes: { type: 'button', title: 'Reload the page and outline the elements you sent' },
  });
  const reply = make('button', {
    className: 'pill pick-row__action',
    text: 'Reply',
    attributes: { type: 'button', title: 'Add a follow-up to this review' },
  });
  const actions = fill(make('span', { className: 'pick-row__actions' }), reload, reply);
  const element = fill(
    make('div', { className: 'pick-row', attributes: { hidden: '' } }),
    dot,
    text,
    actions,
  );

  reload.addEventListener('click', () => handlers.onReloadAndShow());
  reply.addEventListener('click', () => handlers.onReply());

  return {
    element,
    set(view) {
      if (view === null) {
        element.setAttribute('hidden', '');
        return;
      }
      dot.className = `dot dot--${view.status === 'lost' ? 'unknown' : view.status}`;
      text.textContent = describe(view);
      text.title = text.textContent;
      reload.hidden = view.status !== 'done' || (view.itemCount ?? 0) === 0;
      reply.hidden = view.status === 'lost';
      element.removeAttribute('hidden');
    },
  };
}

function describe(view: PickStatusView): string {
  const replies = view.followUps === 0 ? '' : ` · ${view.followUps} ${view.followUps === 1 ? 'reply' : 'replies'}`;
  return `${view.paneId} · ${describeStatus(view.status)}${replies}`;
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
