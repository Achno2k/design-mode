import type { TraySide } from '../lib/panel-position.ts';

/**
 * The bar and its edge tab trade places with motion, so it is clear that the
 * one becomes the other.
 *
 * Collapsing shrinks the bar towards the spot the tab will occupy while it
 * fades, then the tab slides in from the edge. Expanding is the same film
 * backwards. Both are Web Animations rather than transitions because the bar
 * is `hidden` between the two states, and a transition cannot run on an
 * element that is about to stop existing in layout. Under reduced motion the
 * swap is immediate.
 */

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 0.6, 1)';
/** How small the bar gets before it hands over to the tab. */
const SHRUNK = 0.12;

export async function shrinkBarInto(panel: HTMLElement, side: TraySide): Promise<void> {
  if (reduced()) return;
  const [from, to] = barKeyframes(panel, side);
  await run(panel, [from, to], 260, EASE_IN);
}

export async function growBarFrom(panel: HTMLElement, side: TraySide): Promise<void> {
  if (reduced()) return;
  const [from, to] = barKeyframes(panel, side);
  await run(panel, [to, from], 300, EASE_OUT);
}

export async function slideTabIn(tab: HTMLElement, side: TraySide): Promise<void> {
  if (reduced()) return;
  await run(tab, [tabAway(side), tabHome()], 240, EASE_OUT);
}

export async function slideTabOut(tab: HTMLElement, side: TraySide): Promise<void> {
  if (reduced()) return;
  await run(tab, [tabHome(), tabAway(side)], 160, EASE_IN);
}

/**
 * The bar at rest, and the bar shrunk to a dot where the tab sits. The rest
 * state keeps whatever transform the stylesheet gave it (the docked bar is
 * centred with one), so the two frames differ only by the travel and scale.
 */
function barKeyframes(panel: HTMLElement, side: TraySide): [Keyframe, Keyframe] {
  const box = panel.getBoundingClientRect();
  const current = getComputedStyle(panel).transform;
  const base = current === 'none' ? '' : current;
  const dx = tabCentreX(side) - (box.left + box.width / 2);
  const dy = window.innerHeight / 2 - (box.top + box.height / 2);
  return [
    { transform: base, opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) ${base} scale(${SHRUNK})`, opacity: 0 },
  ];
}

/** The tab is a fixed-width strip on the edge; its centre needs no measuring. */
function tabCentreX(side: TraySide): number {
  return side === 'right' ? window.innerWidth - 22 : 22;
}

function tabHome(): Keyframe {
  return { transform: 'translateY(-50%)', opacity: 1 };
}

function tabAway(side: TraySide): Keyframe {
  return { transform: `translateY(-50%) translateX(${side === 'right' ? '110%' : '-110%'})`, opacity: 0 };
}

async function run(element: HTMLElement, frames: Keyframe[], duration: number, easing: string): Promise<void> {
  const animation = element.animate(frames, { duration, easing, fill: 'both' });
  try {
    await animation.finished;
  } catch {
    // Cancelled by a newer animation on the same element; the caller has moved on.
  } finally {
    animation.cancel();
  }
}

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
