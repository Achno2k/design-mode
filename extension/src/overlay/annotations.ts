import type { ItemTriage } from '../lib/protocol.ts';
import { fill, keepScrollInside, make } from './dom.ts';
import { CLOSE_ICON, TRASH_ICON } from './icons.ts';
import { createTriageControl } from './triage-control.ts';

/** One completed annotation, as the toolbar shows it back to the user. */
export interface AnnotationItem {
  /** Position in the session's list, which is also how it is removed. */
  index: number;
  kind: 'element' | 'drawing';
  /** The lead, such as `<button>` or `Drawing`. */
  tag: string;
  /** The rest, such as `.btn-primary` or `3 strokes`. */
  detail: string;
  /** What the user wrote, or a stand-in when they only made live edits. */
  comment: string;
  /** Base64 PNG without a data-URL prefix, when the capture succeeded. */
  screenshot?: string;
  triage?: ItemTriage;
}

/** What a row lets the user do to its annotation. */
export interface AnnotationActions {
  onRemove(index: number): void;
  onEdit(index: number): void;
  onReselect(index: number): void;
  /** An empty triage means the item was cleared back to untriaged. */
  onSetTriage(index: number, triage: ItemTriage): void;
  /** Drop every queued annotation. */
  onClear(): void;
}

/** The card of pending annotations that floats above the toolbar. */
export interface AnnotationStack {
  set(items: AnnotationItem[]): void;
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  element(): HTMLElement;
}

/**
 * Show what is about to be sent, one row per annotation.
 *
 * A running count says how much is queued but not what it is, and a review
 * assembled over several minutes is easy to lose track of. Each row carries its
 * own thumbnail and its own controls, so a mistake costs one click rather than
 * the whole batch: reword it, point it at a different element, or say how
 * serious it is. The thumbnail is the exact crop the agent will receive, and
 * clicking it shows it at full size.
 */
export function createAnnotationStack(actions: AnnotationActions): AnnotationStack {
  const list = make('div', { className: 'stack__list' });
  const clear = make('button', {
    className: 'stack__clear',
    attributes: { type: 'button', title: 'Remove every annotation', 'aria-label': 'Remove every annotation' },
  });
  clear.innerHTML = TRASH_ICON;
  clear.addEventListener('click', () => actions.onClear());
  const root = keepScrollInside(
    fill(
      make('div', { className: 'stack', attributes: { 'data-drag-ignore': '' } }),
      list,
      fill(make('div', { className: 'stack__foot' }), clear),
    ),
  );

  let open = false;

  function setOpen(next: boolean): void {
    open = next && list.childElementCount > 0;
    root.classList.toggle('stack--open', open);
  }

  return {
    set(items) {
      list.replaceChildren(...items.map(row));
      // Nothing left to look at, so the card gets out of the way by itself.
      if (items.length === 0) setOpen(false);
    },

    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    element: () => root,
  };

  function row(item: AnnotationItem): HTMLElement {
    const remove = make('button', {
      className: 'stack__remove',
      attributes: { type: 'button', title: 'Remove', 'aria-label': `Remove ${item.tag}` },
    });
    remove.innerHTML = CLOSE_ICON;
    remove.addEventListener('click', () => actions.onRemove(item.index));

    const shot = thumbnail(item);
    const rowElement = fill(
      make('div', { className: 'stack__row' }),
      shot,
      fill(
        make('div', { className: 'stack__body' }),
        fill(
          make('div', { className: 'stack__meta' }),
          make('span', { className: 'stack__tag', text: item.tag }),
          make('span', { className: 'stack__detail', text: item.detail }),
        ),
        make('p', { className: 'stack__comment', text: item.comment }),
        controls(item),
      ),
      remove,
    );
    if (item.screenshot !== undefined) {
      shot.addEventListener('click', () => rowElement.classList.toggle('stack__row--expanded'));
    }
    return rowElement;
  }

  function controls(item: AnnotationItem): HTMLElement {
    const edit = actionButton('Edit', `Edit the comment on ${item.tag}`);
    edit.addEventListener('click', () => actions.onEdit(item.index));

    const triage = createTriageControl((next) => actions.onSetTriage(item.index, next ?? {}));
    triage.set(item.triage);

    const controlsRow = fill(make('div', { className: 'stack__controls' }), edit);

    // A drawing is a region, not an element, so there is nothing to re-pick.
    if (item.kind === 'element') {
      const reselect = actionButton('Reselect', `Pick a different element for ${item.tag}`);
      reselect.addEventListener('click', () => actions.onReselect(item.index));
      controlsRow.append(reselect);
    }

    return fill(controlsRow, triage.element());
  }
}

function actionButton(text: string, title: string): HTMLButtonElement {
  return make('button', {
    className: 'stack__action',
    text,
    attributes: { type: 'button', title },
  });
}

/** The captured crop, or an empty tile when the screenshot did not arrive. */
function thumbnail(item: AnnotationItem): HTMLElement {
  if (item.screenshot === undefined) {
    return make('span', { className: 'stack__shot stack__shot--missing', attributes: { title: 'No screenshot' } });
  }

  return make('img', {
    className: 'stack__shot',
    attributes: {
      src: `data:image/png;base64,${item.screenshot}`,
      alt: `Screenshot of ${item.tag}`,
      title: 'This crop is sent with the review. Click to enlarge.',
    },
  });
}
