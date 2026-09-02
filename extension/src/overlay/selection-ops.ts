import type { ItemTriage, Selection, SelectionBox } from '../lib/protocol.ts';
import { measure } from './collect.ts';
import type { Composer, ComposerInitial } from './composer.ts';
import type { ReviewSessionState } from './review-session.ts';
import { toAnnotationItem } from './selection-shapes.ts';
import type { CommittedStyleEdits } from './style-editor.ts';
import type { StyleEffects } from './style-effects.ts';
import type { Tray } from './tray.ts';

/** Everything that changes the list of queued annotations. */
export interface SelectionOps {
  add(selection: Selection, effect?: CommittedStyleEdits): void;
  remove(index: number): void;
  /** Drop every annotation and page note, and undo their live edits. */
  clear(): void;
  /** Re-render the annotation card from the current list. */
  show(): void;
  /** Reopen the composer on an item to change its comment or triage. */
  edit(index: number): void;
  /** Start picking; the next element picked takes this item's place. */
  reselect(index: number): void;
  move(index: number, direction: -1 | 1): void;
  setTriage(index: number, triage: ItemTriage): void;
  /** What a composer opening for a new pick should start with, if anything. */
  pendingInitial(): ComposerInitial | undefined;
}

export interface SelectionOpsDeps {
  selections: Selection[];
  styleEffects: StyleEffects;
  reviewSession: ReviewSessionState;
  tray: Tray;
  composer: Composer;
  isPicking(): boolean;
  setPicking(next: boolean): void;
  /** Fires whenever the list changes, so a pending send confirmation resets. */
  onChanged(): void;
}

/**
 * The queued annotations as one list with one set of operations on it.
 *
 * Items are edited in place rather than replaced: live style edits are keyed
 * by the selection object, so a new object would orphan the edits it owns.
 * Only a reselect makes a new object, and it hands the old effect back first.
 */
export function createSelectionOps(deps: SelectionOpsDeps): SelectionOps {
  const { selections, styleEffects, reviewSession, tray, composer } = deps;

  // Tracked by identity rather than index, so removing or reordering other
  // items while the user is still picking cannot point the replacement at the
  // wrong one.
  let replacing: Selection | null = null;

  function show(): void {
    tray.setSelections(selections.map(toAnnotationItem));
  }

  function changed(): void {
    deps.onChanged();
    show();
    reviewSession.save(deps.isPicking());
  }

  function add(selection: Selection, effect?: CommittedStyleEdits): void {
    const index = replacing === null ? -1 : selections.indexOf(replacing);
    const old = replacing;
    replacing = null;

    // A drawing is a region, not the element the user was asked to click, so
    // it goes on the end and the reselect is simply dropped.
    if (old === null || index < 0 || selection.kind === 'drawing') {
      selections.push(selection);
      styleEffects.add(selection, effect);
      changed();
      return;
    }

    styleEffects.remove(old);
    selections.splice(index, 1, selection);
    styleEffects.add(selection, effect);
    changed();
  }

  function remove(index: number): void {
    const selection = selections[index];
    if (selection === undefined) return;

    styleEffects.remove(selection);
    selections.splice(index, 1);
    changed();
    tray.setStatus(selections.length === 0 ? '' : 'Annotation removed.', 'idle');
  }

  function clear(): void {
    replacing = null;
    styleEffects.clear();
    reviewSession.clearContent(deps.isPicking());
    deps.onChanged();
    show();
  }

  function edit(index: number): void {
    const selection = selections[index];
    if (selection === undefined) return;

    const item = toAnnotationItem(selection, index);
    composer.openAt(
      currentBox(selection),
      { tag: item.tag, detail: item.detail },
      (draft) => {
        selection.comment = draft.comment;
        applyTriage(selection, draft.triage);
        changed();
        tray.setStatus(`Updated item ${index + 1}.`, 'idle');
      },
      () => undefined,
      { comment: selection.comment, ...(selection.triage === undefined ? {} : { triage: selection.triage }) },
    );
  }

  function reselect(index: number): void {
    const selection = selections[index];
    if (selection === undefined) return;

    replacing = selection;
    // Anything half-written for a new pick would otherwise swallow the click.
    composer.close();
    deps.setPicking(true);
    tray.setStatus(`Click the element that replaces item ${index + 1}.`, 'busy');
  }

  function move(index: number, direction: -1 | 1): void {
    const other = index + direction;
    const a = selections[index];
    const b = selections[other];
    if (a === undefined || b === undefined) return;

    selections[index] = b;
    selections[other] = a;
    changed();
    tray.setStatus(`Moved to ${other + 1}.`, 'idle');
  }

  function setTriage(index: number, triage: ItemTriage): void {
    const selection = selections[index];
    if (selection === undefined) return;

    applyTriage(selection, triage);
    changed();
  }

  function pendingInitial(): ComposerInitial | undefined {
    if (replacing === null || !selections.includes(replacing)) return undefined;
    return {
      comment: replacing.comment,
      ...(replacing.triage === undefined ? {} : { triage: replacing.triage }),
    };
  }

  return { add, remove, clear, show, edit, reselect, move, setTriage, pendingInitial };
}

/** Set or drop the triage so an untriaged item carries no empty object. */
function applyTriage(selection: Selection, triage: ItemTriage | undefined): void {
  if (triage === undefined || (triage.category === undefined && triage.priority === undefined)) {
    delete selection.triage;
    return;
  }
  selection.triage = triage;
}

/**
 * Where the item is now, if its element is still on this page; otherwise where
 * it was when captured, which the composer clamps into view.
 */
function currentBox(selection: Selection): SelectionBox {
  if (selection.kind !== 'element' || selection.pageUrl !== window.location.href) {
    return selection.box;
  }
  try {
    const element = document.querySelector(selection.selector);
    return element === null ? selection.box : measure(element);
  } catch {
    // A selector the page cannot parse, such as one that crosses a frame.
    return selection.box;
  }
}
