/**
 * Properties worth sending. The full computed style has around 340 entries,
 * almost all of them irrelevant to a visual review and expensive to read.
 */
const REPORTED_PROPERTIES = [
  'display',
  'position',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'grid-template-columns',
  'width',
  'height',
  'padding',
  'margin',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'color',
  'background-color',
  'border',
  'border-radius',
  'box-shadow',
  'opacity',
  'overflow',
  'z-index',
] as const;

/** Values that carry no information and only make the note harder to read. */
const NOISE = new Set(['none', 'normal', 'auto', 'static', '0px', 'rgba(0, 0, 0, 0)', 'visible', '1']);

/** Read the handful of computed styles that matter for a visual review. */
export function readStyles(element: Element): Record<string, string> {
  const computed = window.getComputedStyle(element);
  const styles: Record<string, string> = {};

  for (const property of REPORTED_PROPERTIES) {
    const value = computed.getPropertyValue(property).trim();
    if (value !== '' && !NOISE.has(value)) {
      styles[property] = value;
    }
  }

  return styles;
}

/** Leading text content, short enough to read but long enough to grep for. */
export function readText(element: Element, limit = 120): string {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
