import type { Selection } from '../lib/protocol.ts';
import type { CommittedStyleEdits } from './style-editor.ts';

/** Reversible inline edits owned by selections in the current page. */
export interface StyleEffects {
  add(selection: Selection, effect: CommittedStyleEdits | undefined): void;
  remove(selection: Selection): void;
  clear(): void;
}

/** Keep style edits reversible even when a selection is removed out of order. */
export function createStyleEffects(): StyleEffects {
  const entries: { selection: Selection; effect: CommittedStyleEdits }[] = [];

  function add(selection: Selection, effect: CommittedStyleEdits | undefined): void {
    if (effect !== undefined) entries.push({ selection, effect });
  }

  function remove(selection: Selection): void {
    const index = entries.findIndex((entry) => entry.selection === selection);
    if (index < 0) return;

    revertAll();
    entries.splice(index, 1);
    for (const entry of entries) entry.effect.apply();
  }

  function clear(): void {
    revertAll();
    entries.length = 0;
  }

  function revertAll(): void {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      entries[index]?.effect.revert();
    }
  }

  return { add, remove, clear };
}
