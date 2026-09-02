import { make } from './dom.ts';

/** Coloured bands over an element's margin and padding while those are being edited. */
export interface BoxModel {
  /** Draw the bands for this element's current geometry. Call again to refresh. */
  show(element: Element): void;
  hide(): void;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
type Side = (typeof SIDES)[number];
type Edges = Record<Side, number>;

/**
 * Show where an element's spacing is, the way devtools does, so a padding or
 * margin edit can be judged against the page rather than against a number.
 *
 * Eight bands are created once and repositioned on every show. They are
 * `position: fixed` in viewport coordinates from `getBoundingClientRect`, so
 * they sit right regardless of scroll, and `pointer-events: none` so the
 * composer beneath the pointer keeps working.
 */
export function createBoxModel(layer: HTMLElement): BoxModel {
  const margin = bands('margin');
  const padding = bands('padding');
  for (const side of SIDES) layer.append(margin[side], padding[side]);

  function show(element: Element): void {
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    const marginOf = edges(computed, (side) => `margin-${side}`);
    const paddingOf = edges(computed, (side) => `padding-${side}`);
    const borderOf = edges(computed, (side) => `border-${side}-width`);

    // Vertical margins on an inline box have no effect, so drawing them would
    // claim space the page never gives up.
    if (computed.display === 'inline') {
      marginOf.top = 0;
      marginOf.bottom = 0;
    }

    drawMargins(margin, rect, marginOf);
    drawPadding(padding, rect, borderOf, paddingOf);
  }

  function hide(): void {
    for (const side of SIDES) {
      margin[side].hidden = true;
      padding[side].hidden = true;
    }
  }

  return { show, hide };
}

function bands(kind: 'margin' | 'padding'): Record<Side, HTMLElement> {
  const band = (): HTMLElement =>
    make('div', { className: `box-band box-band--${kind}`, attributes: { hidden: '' } });
  return { top: band(), right: band(), bottom: band(), left: band() };
}

function edges(computed: CSSStyleDeclaration, property: (side: Side) => string): Edges {
  const read = (side: Side): number => Number.parseFloat(computed.getPropertyValue(property(side))) || 0;
  return { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') };
}

/**
 * Margin bands wrap the border box. A negative margin has no area of its own,
 * so its band is drawn outside at the same thickness and marked, which keeps it
 * visible without hiding the element it pulls over.
 */
function drawMargins(bandsOf: Record<Side, HTMLElement>, rect: DOMRect, marginOf: Edges): void {
  const size = (side: Side): number => Math.abs(marginOf[side]);
  const outerLeft = rect.left - size('left');
  const outerWidth = rect.width + size('left') + size('right');

  place(bandsOf.top, outerLeft, rect.top - size('top'), outerWidth, size('top'));
  place(bandsOf.bottom, outerLeft, rect.bottom, outerWidth, size('bottom'));
  place(bandsOf.left, outerLeft, rect.top, size('left'), rect.height);
  place(bandsOf.right, rect.right, rect.top, size('right'), rect.height);

  for (const side of SIDES) bandsOf[side].classList.toggle('box-band--negative', marginOf[side] < 0);
}

/** Padding bands sit inside the border, and the side bands stop short of the top and bottom ones. */
function drawPadding(
  bandsOf: Record<Side, HTMLElement>,
  rect: DOMRect,
  borderOf: Edges,
  paddingOf: Edges,
): void {
  const innerLeft = rect.left + borderOf.left;
  const innerTop = rect.top + borderOf.top;
  const innerWidth = rect.width - borderOf.left - borderOf.right;
  const innerHeight = rect.height - borderOf.top - borderOf.bottom;
  const sideTop = innerTop + paddingOf.top;
  const sideHeight = innerHeight - paddingOf.top - paddingOf.bottom;

  place(bandsOf.top, innerLeft, innerTop, innerWidth, paddingOf.top);
  place(bandsOf.bottom, innerLeft, innerTop + innerHeight - paddingOf.bottom, innerWidth, paddingOf.bottom);
  place(bandsOf.left, innerLeft, sideTop, paddingOf.left, sideHeight);
  place(bandsOf.right, innerLeft + innerWidth - paddingOf.right, sideTop, paddingOf.right, sideHeight);
}

/** A band with no area is hidden rather than drawn as a hairline. */
function place(band: HTMLElement, left: number, top: number, width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    band.hidden = true;
    return;
  }
  Object.assign(band.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  band.hidden = false;
}
