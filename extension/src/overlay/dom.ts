/** Small helpers for building overlay DOM without a framework. */

/** Create an element with classes, text, and attributes in one call. */
export function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string; attributes?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;

  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

/** Append several children at once and return the parent. */
export function fill<T extends HTMLElement>(parent: T, ...children: Node[]): T {
  parent.append(...children);
  return parent;
}

/** Room to leave around a floating panel. */
export interface Placement {
  /** Gap between the panel and the element it points at. */
  gap?: number;
  /** Distance kept from the viewport edges. */
  margin?: number;
  /** Space at the bottom that something else already occupies, such as the tray. */
  reservedBottom?: number;
}

/**
 * Put a panel next to an element without letting it leave the viewport.
 *
 * It prefers to sit below, flips above when the space there is too tight, and
 * only falls back to clamping when neither side fits — which happens on
 * elements taller than the window. The bottom of the screen belongs to the
 * tray, so that band is excluded from the space considered available.
 */
export function placeNear(panel: HTMLElement, anchor: DOMRect, placement: Placement = {}): void {
  const { gap = 10, margin = 12, reservedBottom = 0 } = placement;
  const { width, height } = panel.getBoundingClientRect();

  const floor = window.innerHeight - margin - reservedBottom;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - height;

  const top = below + height <= floor ? below : above >= margin ? above : clamp(below, margin, Math.max(margin, floor - height));

  const maxLeft = window.innerWidth - width - margin;
  panel.style.left = `${clamp(anchor.left, margin, Math.max(margin, maxLeft))}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
