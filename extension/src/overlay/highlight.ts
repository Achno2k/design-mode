import { findChildComponents } from '../inspect/component-children.ts';
import { make } from './dom.ts';

/** The blue box that follows the pointer while picking. */
export interface Highlight {
  /** Outline the hovered element, and the child components inside it. */
  show(element: Element, label: string): void;
  /**
   * Outline one element on its own, with no child boxes.
   *
   * Used while a comment is being written: the element being described has to
   * stay visible, but the tree around it is hover guidance and would only
   * compete with the composer.
   */
  pin(element: Element, label: string): void;
  hide(): void;
}

/** How many colours the child outlines cycle through before repeating. */
const TREE_COLORS = 6;

/**
 * Outline the element under the pointer, and its child components with it.
 *
 * Every box is `position: fixed` and fed viewport coordinates straight from
 * `getBoundingClientRect`, so they track scrolling without any listeners.
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
  layer.append(box, chip);

  return {
    show(element, label) {
      outline(element, label);
      if (element !== hovered) {
        hovered = element;
        children = findChildComponents(element, host);
      }
      drawChildren();
    },

    pin(element, label) {
      outline(element, label);
      forgetChildren();
    },

    hide() {
      box.setAttribute('hidden', '');
      chip.setAttribute('hidden', '');
      forgetChildren();
    },
  };

  function outline(element: Element, label: string): void {
    const rect = element.getBoundingClientRect();
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
