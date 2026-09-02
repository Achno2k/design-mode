/** Web components nest, but not this deeply before something is wrong. */
const MAX_SHADOW_DEPTH = 32;

/**
 * The innermost element at a point, looking through open shadow roots.
 *
 * `document.elementFromPoint` stops at a shadow host, which is the wrapper a
 * web component renders and never the button inside it that the user meant.
 * Each root is asked in turn until the hit has no shadow tree of its own.
 * Closed roots cannot be entered, so their host is the answer.
 */
export function deepElementFromPoint(root: DocumentOrShadowRoot, x: number, y: number): Element | null {
  let element = root.elementFromPoint(x, y);

  for (let depth = 0; element !== null && depth < MAX_SHADOW_DEPTH; depth += 1) {
    const shadow = element.shadowRoot;
    if (shadow === null) break;

    // A slotted light-DOM child reports itself; a bare host reports itself too.
    // Either way there is nothing deeper to enter.
    const inner = shadow.elementFromPoint(x, y);
    if (inner === null || inner === element) break;
    element = inner;
  }

  return element;
}
