import { make } from './dom.ts';

/** The blue box that follows the pointer while picking. */
export interface Highlight {
  show(rect: DOMRect, label: string): void;
  hide(): void;
}

/**
 * Outline the element under the pointer.
 *
 * The box is `position: fixed` and fed viewport coordinates straight from
 * `getBoundingClientRect`, so it tracks scrolling without any listeners.
 */
export function createHighlight(layer: HTMLElement): Highlight {
  const box = make('div', { className: 'highlight', attributes: { hidden: '' } });
  const chip = make('div', { className: 'chip', attributes: { hidden: '' } });
  layer.append(box, chip);

  return {
    show(rect, label) {
      Object.assign(box.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      box.removeAttribute('hidden');

      chip.textContent = label;
      // Sit the chip above the element, or below it when there is no room.
      const above = rect.top > 24;
      chip.style.left = `${Math.max(4, rect.left)}px`;
      chip.style.top = above ? `${rect.top - 22}px` : `${rect.bottom + 4}px`;
      chip.removeAttribute('hidden');
    },

    hide() {
      box.setAttribute('hidden', '');
      chip.setAttribute('hidden', '');
    },
  };
}
