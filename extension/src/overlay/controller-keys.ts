import type { Composer } from './composer.ts';
import { isAnnotateShortcut } from './controller-input.ts';

export interface KeyHandlerDeps {
  composer: Composer;
  isPicking(): boolean;
  setPicking(next: boolean): void;
  /** Handle a key while picking with nothing open. Return true when it was used. */
  walk?(event: KeyboardEvent): boolean;
}

/**
 * The session's keyboard handling.
 *
 * Escape steps back one level at a time: close the composer, then leave
 * picking, and never further. Closing the session is an explicit action, so a
 * stray keypress cannot discard a review.
 */
export function createKeyHandler(deps: KeyHandlerDeps): (event: KeyboardEvent) => void {
  return (event) => {
    if (isAnnotateShortcut(event)) {
      event.preventDefault();
      deps.setPicking(!deps.isPicking());
      return;
    }

    if (event.key === 'Escape') {
      if (deps.composer.isOpen()) {
        event.preventDefault();
        deps.composer.close();
        return;
      }
      if (deps.isPicking()) {
        event.preventDefault();
        deps.setPicking(false);
      }
      return;
    }

    if (deps.isPicking() && !deps.composer.isOpen() && deps.walk?.(event) === true) {
      event.preventDefault();
    }
  };
}
