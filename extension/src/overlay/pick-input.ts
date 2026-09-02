import { deepElementFromPoint } from '../inspect/shadow.ts';
import { describeHover } from './collect.ts';
import type { Composer } from './composer.ts';
import { pageElementAt } from './controller-input.ts';
import type { Highlight } from './highlight.ts';

/** Pointer handling while elements are being picked. */
export interface PickInput {
  attach(): void;
  detach(): void;
  /** The element under the pointer, or the one the keyboard walked to. */
  current(): Element | null;
  /** Move the highlight somewhere the pointer is not, e.g. from the keyboard. */
  setCurrent(element: Element | null): void;
  /** Treat an element as clicked: pin it and hand it to the composer. */
  pick(element: Element): void;
}

export interface PickInputDeps {
  host: Element;
  highlight: Highlight;
  /** Only asked whether it is up; a frame, which has no composer, passes a stub. */
  composer: Pick<Composer, 'isOpen' | 'close'>;
  onPick(element: Element): void;
}

/**
 * Hover highlights, click picks, and both go through one tracked element so
 * that anything else steering the highlight, such as arrow keys, agrees with
 * the pointer about what is current.
 */
export function createPickInput(deps: PickInputDeps): PickInput {
  let current: Element | null = null;

  /** The page element under the pointer, looking inside web components. */
  function elementAt(event: MouseEvent): Element | null {
    const top = pageElementAt(event, deps.host);
    if (top === null || top.shadowRoot === null) return top;
    return deepElementFromPoint(top.shadowRoot, event.clientX, event.clientY) ?? top;
  }

  function onPointerMove(event: PointerEvent): void {
    if (deps.composer.isOpen()) return;
    setCurrent(elementAt(event));
  }

  function onClick(event: MouseEvent): void {
    const element = elementAt(event);
    if (element === null) return;

    // The page must not act on this click — it was aimed at design mode.
    event.preventDefault();
    event.stopPropagation();

    if (deps.composer.isOpen()) {
      deps.composer.close();
      return;
    }
    pick(element);
  }

  function setCurrent(element: Element | null): void {
    current = element;
    if (element === null) deps.highlight.hide();
    else deps.highlight.show(element, describeHover(element));
  }

  function pick(element: Element): void {
    current = element;
    // Stays outlined while its comment is written, but with no child boxes.
    deps.highlight.pin(element, describeHover(element));
    deps.onPick(element);
  }

  const listeners: [keyof WindowEventMap, (event: never) => void][] = [
    ['pointermove', onPointerMove],
    ['click', onClick],
  ];

  return {
    attach() {
      for (const [type, handler] of listeners) {
        window.addEventListener(type, handler as EventListener, true);
      }
    },
    detach() {
      for (const [type, handler] of listeners) {
        window.removeEventListener(type, handler as EventListener, true);
      }
      current = null;
    },
    current: () => current,
    setCurrent,
    pick,
  };
}
