import { findChildComponents } from '../inspect/component-children.ts';
import { make } from './dom.ts';

/** The blue box that follows the pointer while picking. */
export interface Highlight {
  /** Outline the hovered element, and the child components inside it. */
  show(element: Element, label: string): void;
  /**
   * Outline one element on its own, with no child boxes and no chip.
   *
   * Used while a comment is being written: the element being described has to
   * stay visible, but the tree around it is hover guidance and would only
   * compete with the composer, and the chip would sit exactly where the
   * composer opens — the composer names the element itself.
   */
  pin(element: Element): void;
  hide(): void;
}

/** How many colours the child outlines cycle through before repeating. */
const TREE_COLORS = 6;

/**
 * Outline the element under the pointer, and its child components with it.
 *
 * Every box is `position: fixed` and fed viewport coordinates from
 * `getBoundingClientRect`. The pointer feeds them on every move; a scroll or
 * resize with the pointer still measures again, or the box would stay behind
 * while the element moved out from under it.
 *
 * Child boxes are pooled and re-measured on each move rather than rebuilt: the
 * *set* of children only changes when the hovered element does, but where they
 * sit on screen changes constantly.
 */
export function createHighlight(layer: HTMLElement, host: Element): Highlight {
  const box = make('div', { className: 'highlight', attributes: { hidden: '' } });
  const chip = make('div', { className: 'chip', attributes: { hidden: '' } });
  const childBoxes: HTMLElement[] = [];
  let hovered: Element | null = null;
  let children: Element[] = [];
  /** What the box is on right now, so a scroll can measure it again. */
  let shown: { element: Element; label: string | null } | null = null;
  layer.append(box, chip);

  function follow(): void {
    // Re-injection replaces the whole overlay; the old boxes let go here.
    if (!layer.isConnected) {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      return;
    }
    if (shown === null) return;
    outline(shown.element, shown.label);
    drawChildren();
  }

  window.addEventListener('scroll', follow, { capture: true, passive: true });
  window.addEventListener('resize', follow);

  return {
    show(element, label) {
      outline(element, label);
      if (element !== hovered) {
        hovered = element;
        children = findChildComponents(element, host);
      }
      drawChildren();
    },

    pin(element) {
      outline(element, null);
      forgetChildren();
    },

    hide() {
      shown = null;
      box.setAttribute('hidden', '');
      chip.setAttribute('hidden', '');
      forgetChildren();
    },
  };

  function outline(element: Element, label: string | null): void {
    shown = { element, label };
    const rect = element.getBoundingClientRect();
    Object.assign(box.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    box.removeAttribute('hidden');

    if (label === null) {
      chip.setAttribute('hidden', '');
      return;
    }
    chip.textContent = label;
    // Sit the chip above the element, or below it when there is no room.
    const above = rect.top > 24;
    chip.style.left = `${Math.max(4, rect.left)}px`;
    chip.style.top = above ? `${rect.top - 22}px` : `${rect.bottom + 4}px`;
    chip.removeAttribute('hidden');
  }

  /** Drop the boxes and the memo, so the next hover recomputes from scratch. */
  function forgetChildren(): void {
    hovered = null;
    children = [];
    drawChildren();
  }

  function drawChildren(): void {
    for (let index = 0; index < Math.max(children.length, childBoxes.length); index += 1) {
      const child = children[index];
      if (child === undefined) {
        childBoxes[index]?.setAttribute('hidden', '');
        continue;
      }

      const outlineBox = childBoxes[index] ?? addChildBox(index);
      const rect = child.getBoundingClientRect();
      Object.assign(outlineBox.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      outlineBox.removeAttribute('hidden');
    }
  }

  /** Insert before the parent box so its border always paints on top. */
  function addChildBox(index: number): HTMLElement {
    const outlineBox = make('div', {
      className: `child child--${(index % TREE_COLORS) + 1}`,
      attributes: { hidden: '' },
    });
    layer.insertBefore(outlineBox, box);
    childBoxes[index] = outlineBox;
    return outlineBox;
  }
}
