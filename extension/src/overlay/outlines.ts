import { fill, make } from './dom.ts';

/** Numbered boxes around elements that were sent in the last review. */
export interface Outlines {
  /** Outline each element, numbered in order. Replaces any earlier set. */
  show(elements: Element[]): void;
  hide(): void;
}

/**
 * Unlike the hover highlight, these boxes are not re-measured by pointer
 * movement, so they follow scrolling and resizing themselves. Listening only
 * while something is shown keeps an idle overlay free of scroll work.
 */
export function createOutlines(layer: HTMLElement): Outlines {
  const boxes: HTMLElement[] = [];
  let shown: Element[] = [];
  let listening = false;

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
    },

    hide() {
      shown = [];
      for (const box of boxes) box.setAttribute('hidden', '');
      listen(false);
    },
  };
}
