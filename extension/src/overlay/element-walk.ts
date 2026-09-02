/** Keys that move the highlight through the tree while picking. */
export type WalkKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function isWalkKey(key: string): key is WalkKey {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

/**
 * Whether a key press belongs to something being typed rather than to the walk.
 *
 * The overlay's own fields are retargeted to its host by the closed shadow
 * root, so the host is the only thing a window listener ever sees of them.
 */
export function isTypingTarget(target: EventTarget | null, host: Element): boolean {
  if (!(target instanceof Element)) return false;
  if (target === host) return true;
  return target.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

/**
 * The element one step away from `current` in the direction of an arrow key.
 *
 * Up is the parent, or the host when the parent is a shadow root. Down is the
 * first child, entering a shadow tree before the light DOM so a component's
 * insides are reachable. Left and right are siblings. The overlay's own host
 * sits beside `<body>` and is stepped over, and `<html>` is never a stop
 * because nothing useful can be said about it.
 */
export function stepElement(current: Element, key: WalkKey, host: Element): Element | null {
  const next = rawStep(current, key, host);
  return next === null || next === host || next === document.documentElement ? null : next;
}

function rawStep(current: Element, key: WalkKey, host: Element): Element | null {
  switch (key) {
    case 'ArrowUp':
      return parentOf(current);
    case 'ArrowDown':
      return current.shadowRoot?.firstElementChild ?? current.firstElementChild;
    case 'ArrowLeft':
      return sibling(current, host, 'previousElementSibling');
    case 'ArrowRight':
      return sibling(current, host, 'nextElementSibling');
  }
}

function parentOf(element: Element): Element | null {
  const parent = element.parentElement;
  if (parent !== null) return parent;

  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function sibling(
  element: Element,
  host: Element,
  direction: 'previousElementSibling' | 'nextElementSibling',
): Element | null {
  let next = element[direction];
  while (next === host) next = next[direction];
  return next;
}
