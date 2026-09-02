import type { ItemTriage, Selection } from '../lib/protocol.ts';
import type { ComposerInitial } from './composer.ts';
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
  edit(index: number): void;
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
  isPicking(): boolean;
  /** Fires whenever the list changes, so a pending send confirmation resets. */
  onChanged(): void;
}

/**
 * The queued annotations as one list with one set of operations on it.
 *
 * Editing, re-selecting, and reordering are placeholders here; they are wired
 * so the tray can offer them before they land.
 */
export function createSelectionOps(deps: SelectionOpsDeps): SelectionOps {
  const { selections, styleEffects, reviewSession, tray } = deps;

  function show(): void {
    tray.setSelections(selections.map(toAnnotationItem));
  }

  function changed(): void {
    deps.onChanged();
    show();
    reviewSession.save(deps.isPicking());
  }

  function notYet(): void {
    tray.setStatus('Not available yet.', 'idle');
  }

  return {
    add(selection, effect) {
      selections.push(selection);
      styleEffects.add(selection, effect);
      changed();
    },

    /** Drop one annotation from the review without touching the rest. */
    remove(index) {
      const selection = selections[index];
      if (selection === undefined) return;

      styleEffects.remove(selection);
      selections.splice(index, 1);
      changed();
      tray.setStatus(selections.length === 0 ? '' : 'Annotation removed.', 'idle');
    },

    clear() {
      styleEffects.clear();
      reviewSession.clearContent(deps.isPicking());
      deps.onChanged();
      show();
    },

    show,
    edit: notYet,
    reselect: notYet,
    move: notYet,
    setTriage: notYet,
    pendingInitial: () => undefined,
  };
}
