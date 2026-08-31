/**
 * Read and rewrite the copy an element shows.
 *
 * Wording is the change people ask for most often, and describing it in prose
 * ("this should say Portfolio") is strictly worse than showing it. So the
 * composer offers the text alongside the style rows and sends an exact before
 * and after.
 *
 * Only elements whose content is entirely text are offered. An element with
 * element children has no single "text" to rewrite — setting `textContent`
 * there would silently delete its subtree, which is destruction rather than
 * annotation.
 */

/** Form controls carry their content in `value`, everything else in `textContent`. */
function isValueControl(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && EDITABLE_INPUT_TYPES.has(element.type);
}

/** Input types whose value is prose. A colour picker or a checkbox is not. */
const EDITABLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

/** True when every child is a text node, so `textContent` owns the whole element. */
function isTextOnly(element: Element): boolean {
  if (element.childNodes.length === 0) return false;
  return Array.from(element.childNodes).every((node) => node.nodeType === Node.TEXT_NODE);
}

/** The element's current copy, or null when it has none to rewrite safely. */
export function readTextContent(element: Element): string | null {
  if (isValueControl(element)) return element.value;
  return isTextOnly(element) ? (element.textContent ?? '') : null;
}

/** Replace the element's copy in place. */
export function writeTextContent(element: Element, value: string): void {
  if (isValueControl(element)) {
    element.value = value;
    return;
  }
  element.textContent = value;
}
