import { fill, make } from './dom.ts';

/** Numbered boxes around elements that were sent in the last review. */
export interface Outlines {
  /** Outline each element, numbered in order. Replaces any earlier set. */
  show(elements: Element[]): void;
  hide(): void;
}

/** How long the boxes stay before fading: enough to find them, not enough to nag. */
const SHOW_MS = 5_000;
/** Matches the opacity transition in `styles/outlines.ts`. */
const FADE_MS = 450;

/**
 * Unlike the hover highlight, these boxes are not re-measured by pointer
 * movement, so they follow scrolling and resizing themselves. Listening only
 * while something is shown keeps an idle overlay free of scroll work.
 *
 * They are a pointer, not a fixture: after a few seconds they fade out on
 * their own, so the page can be read without dismissing anything.
 */
export function createOutlines(layer: HTMLElement): Outlines {
  const boxes: HTMLElement[] = [];
  let shown: Element[] = [];
  let listening = false;
  let fadeTimer: number | null = null;
  let hideTimer: number | null = null;

  function cancelFade(): void {
    if (fadeTimer !== null) window.clearTimeout(fadeTimer);
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    fadeTimer = null;
    hideTimer = null;
    for (const box of boxes) box.classList.remove('outline--fading');
  }

  function scheduleFade(): void {
    fadeTimer = window.setTimeout(() => {
      fadeTimer = null;
      for (const box of boxes) box.classList.add('outline--fading');
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        hide();
      }, FADE_MS);
    }, SHOW_MS);
  }

  function hide(): void {
    cancelFade();
    shown = [];
    for (const box of boxes) box.setAttribute('hidden', '');
    listen(false);
  }

  function place(): void {
    for (const [index, element] of shown.entries()) {
      const box = boxes[index];
      if (box === undefined) continue;
      const rect = element.getBoundingClientRect();
      Object.assign(box.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
  }

  function listen(next: boolean): void {
    if (listening === next) return;
    listening = next;
    const method = next ? window.addEventListener : window.removeEventListener;
    method.call(window, 'scroll', place, { capture: true, passive: true });
    method.call(window, 'resize', place, { passive: true });
  }

  return {
    show(elements) {
      cancelFade();
      shown = elements;
      for (const [index] of elements.entries()) {
        if (boxes[index] === undefined) {
          const box = fill(
            make('div', { className: 'outline' }),
            make('span', { className: 'outline__number', text: String(index + 1) }),
          );
          layer.append(box);
          boxes[index] = box;
        }
        boxes[index]?.removeAttribute('hidden');
      }
      for (const box of boxes.slice(elements.length)) box.setAttribute('hidden', '');
      place();
      listen(elements.length > 0);
      if (elements.length > 0) scheduleFade();
    },

    hide,
  };
}
