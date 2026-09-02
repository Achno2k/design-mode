import type { ItemTriage } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';
import { CLOSE_ICON } from './icons.ts';

/** One completed annotation, as the toolbar shows it back to the user. */
export interface AnnotationItem {
  /** Position in the session's list, which is also how it is removed. */
  index: number;
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
  onMove(index: number, direction: -1 | 1): void;
  onSetTriage(index: number, triage: ItemTriage): void;
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
 * own thumbnail and its own remove button, so a mistake costs one click rather
 * than the whole batch.
 */
export function createAnnotationStack(actions: AnnotationActions): AnnotationStack {
  const list = make('div', { className: 'stack__list' });
  const root = fill(make('div', { className: 'stack' }), list);

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

    return fill(
      make('div', { className: 'stack__row' }),
      thumbnail(item),
      fill(
        make('div', { className: 'stack__body' }),
        fill(
          make('div', { className: 'stack__meta' }),
          make('span', { className: 'stack__tag', text: item.tag }),
          make('span', { className: 'stack__detail', text: item.detail }),
        ),
        make('p', { className: 'stack__comment', text: item.comment }),
      ),
      remove,
    );
  }
}

/** The captured crop, or an empty tile when the screenshot did not arrive. */
function thumbnail(item: AnnotationItem): HTMLElement {
  if (item.screenshot === undefined) return make('span', { className: 'stack__shot' });

  return make('img', {
    className: 'stack__shot',
    attributes: { src: `data:image/png;base64,${item.screenshot}`, alt: '' },
  });
}
