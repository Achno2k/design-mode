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

/**
 * Keep wheel and touch scrolling inside a panel.
 *
 * `overscroll-behavior` stops the browser chaining a scroll to the page, but
 * pages with their own smooth-scroll code listen for `wheel` on the document
 * and move the page themselves. Those listeners must never hear a wheel that
 * happened over the overlay, so the event stops at the panel. The default is
 * left alone, so the panel's own scrollbar still works.
 */
export function keepScrollInside<T extends HTMLElement>(panel: T): T {
  for (const type of ['wheel', 'touchmove'] as const) {
    panel.addEventListener(type, (event) => event.stopPropagation(), { passive: true });
  }
  return panel;
}

/** Room to leave around a floating panel. */
export interface Placement {
  /** Gap between the panel and the element it points at. */
  gap?: number;
  /** Distance kept from the viewport edges. */
  margin?: number;
  /** Something already on screen that the panel must not cover, such as the tray. */
  avoid?: DOMRect | null;
  /** The side used last time; kept while it still fits, so a scroll does not flip the panel. */
  prefer?: Side;
}

/** Which side of its anchor a panel ended up on. */
export type Side = 'below' | 'above';

/**
 * Put a panel next to an element without letting it leave the viewport.
 *
 * It prefers to sit below, flips above when the space there is too tight, and
 * only falls back to clamping when neither side fits — which happens on
 * elements taller than the window. A place that would cover the obstacle
 * counts as not fitting, so the panel never opens underneath the tray
 * wherever the tray has been dragged; when nothing else is possible it is
 * pushed to whichever side of the obstacle has room.
 */
export function placeNear(panel: HTMLElement, anchor: DOMRect, placement: Placement = {}): Side {
  const { gap = 10, margin = 12, avoid = null, prefer = 'below' } = placement;
  const { width, height } = panel.getBoundingClientRect();

  const maxLeft = window.innerWidth - width - margin;
  const left = clamp(anchor.left, margin, Math.max(margin, maxLeft));
  const floor = window.innerHeight - margin;
  const maxTop = Math.max(margin, floor - height);
  const covers = (top: number): boolean =>
    avoid !== null &&
    left < avoid.right + gap &&
    left + width > avoid.left - gap &&
    top < avoid.bottom + gap &&
    top + height > avoid.top - gap;
  const fits = (top: number): boolean => top >= margin && top + height <= floor && !covers(top);

  const below = anchor.bottom + gap;
  const above = anchor.top - gap - height;
  const order: [Side, number][] = prefer === 'above' ? [['above', above], ['below', below]] : [['below', below], ['above', above]];
  const chosen = order.find(([, top]) => fits(top));
  const side: Side = chosen?.[0] ?? 'below';
  let top = chosen?.[1] ?? clamp(below, margin, maxTop);

  if (avoid !== null && covers(top)) {
    const pastBottom = avoid.bottom + gap;
    const pastTop = avoid.top - gap - height;
    if (pastBottom <= maxTop) top = pastBottom;
    else if (pastTop >= margin) top = pastTop;
  }

  panel.style.left = `${left}px`;
  panel.style.top = `${Math.round(top)}px`;
  return side;
}

/**
 * How tall a panel beside `anchor` may be without covering the obstacle: the
 * larger of the bands above and below it. Only an obstacle the panel would
 * actually sit over horizontally counts, so a tray parked off to one side
 * does not shrink a panel that never touches it.
 */
export function roomBeside(
  anchor: DOMRect,
  width: number,
  avoid: DOMRect | null,
  placement: Placement = {},
): number {
  const { gap = 10, margin = 12 } = placement;
  const whole = window.innerHeight - margin * 2;
  if (avoid === null) return whole;

  const left = clamp(anchor.left, margin, Math.max(margin, window.innerWidth - width - margin));
  const crosses = left < avoid.right + gap && left + width > avoid.left - gap;
  if (!crosses) return whole;
  return Math.max(avoid.top - gap - margin, window.innerHeight - margin - avoid.bottom - gap);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
