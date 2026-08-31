/** How a property is edited in the panel. */
export type EditorKind = 'color' | 'number' | 'text' | 'choice';

/**
 * Which band of the editor a property belongs to.
 *
 * The panel is long enough that an unbroken list reads as a wall. Grouping by
 * what the properties are *for* gives the eye somewhere to rest and puts the
 * things people reach for together within reach of each other.
 */
export type EditorGroup = 'appearance' | 'typography' | 'layout' | 'border';

/** One row in the live style editor. */
export interface EditableProperty {
  /** The CSS property, as written in a stylesheet. */
  property: string;
  label: string;
  kind: EditorKind;
  group: EditorGroup;
  /** Appended to numeric input before the value is applied. */
  unit?: string;
  step?: number;
  choices?: string[];
}

/**
 * Properties the editor exposes.
 *
 * Kept short on purpose: these are the things people reach for when a design
 * looks wrong, not a replacement for the styles panel in devtools.
 */
export const EDITABLE_PROPERTIES: EditableProperty[] = [
  { property: 'color', label: 'Text color', group: 'appearance', kind: 'color' },
  { property: 'background-color', label: 'Background', group: 'appearance', kind: 'color' },
  { property: 'opacity', label: 'Opacity', group: 'appearance', kind: 'number', step: 0.05 },
  { property: 'font-family', label: 'Font', group: 'typography', kind: 'text' },
  { property: 'font-size', label: 'Font size', group: 'typography', kind: 'number', unit: 'px' },
  {
    property: 'font-weight',
    label: 'Font weight',
    group: 'typography', kind: 'choice',
    choices: ['300', '400', '500', '600', '700', '800', '900'],
  },
  { property: 'line-height', label: 'Line height', group: 'typography', kind: 'number', unit: 'px' },
  { property: 'letter-spacing', label: 'Letter spacing', group: 'typography', kind: 'number', unit: 'px' },
  { property: 'padding', label: 'Padding', group: 'layout', kind: 'text' },
  { property: 'margin', label: 'Margin', group: 'layout', kind: 'text' },
  { property: 'width', label: 'Width', group: 'layout', kind: 'number', unit: 'px' },
  { property: 'height', label: 'Height', group: 'layout', kind: 'number', unit: 'px' },
  { property: 'gap', label: 'Gap', group: 'layout', kind: 'text' },
  {
    property: 'display',
    label: 'Display',
    group: 'layout', kind: 'choice',
    choices: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid'],
  },
  {
    property: 'flex-direction',
    label: 'Flex direction',
    group: 'layout', kind: 'choice',
    choices: ['row', 'row-reverse', 'column', 'column-reverse'],
  },
  {
    property: 'align-items',
    label: 'Align items',
    group: 'layout', kind: 'choice',
    choices: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
  },
  {
    property: 'justify-content',
    label: 'Justify content',
    group: 'layout', kind: 'choice',
    choices: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
  },
  { property: 'border-width', label: 'Border width', group: 'border', kind: 'text' },
  { property: 'border-color', label: 'Border color', group: 'border', kind: 'color' },
  { property: 'box-shadow', label: 'Shadow', group: 'border', kind: 'text' },
  { property: 'border-radius', label: 'Radius', group: 'border', kind: 'number', unit: 'px' },
];

/** Computed values that mean "nothing set", which should show as an empty field. */
const UNSET = new Set(['normal', 'auto', 'none']);

/** The value currently in effect, whether it came from a stylesheet or a live edit. */
export function readValue(element: Element, property: EditableProperty): string {
  const raw = window.getComputedStyle(element).getPropertyValue(property.property).trim();
  if (raw === '' || UNSET.has(raw)) return '';

  return property.unit === undefined ? raw : stripUnit(raw, property.unit);
}

/** Apply a value to the element immediately, as an inline style. */
export function applyValue(element: Element, property: EditableProperty, value: string): void {
  const style = (element as HTMLElement).style;
  const trimmed = value.trim();

  if (trimmed === '') {
    style.removeProperty(property.property);
    return;
  }

  const withUnit = property.unit !== undefined && /^-?[\d.]+$/.test(trimmed)
    ? `${trimmed}${property.unit}`
    : trimmed;

  // Important beats stylesheet rules that would otherwise win on specificity.
  style.setProperty(property.property, withUnit, 'important');
}

/** Remove a live edit, letting the page's own styles take over again. */
export function clearValue(element: Element, property: EditableProperty): void {
  (element as HTMLElement).style.removeProperty(property.property);
}

/** The value as it would be written in CSS, for the note sent to the agent. */
export function toCssValue(property: EditableProperty, value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';

  return property.unit !== undefined && /^-?[\d.]+$/.test(trimmed)
    ? `${trimmed}${property.unit}`
    : trimmed;
}

/**
 * `<input type="color">` only understands hex, while computed styles are always
 * `rgb()`. Anything that is not a plain opaque colour falls back to black,
 * which only affects the swatch — the text field still shows the real value.
 */
export function toHex(cssColor: string): string {
  const parts = cssColor.match(/\d+(\.\d+)?/g);
  if (parts === null || parts.length < 3) return '#000000';

  const channels = parts.slice(0, 3).map((part) => Number(part));
  return `#${channels.map((value) => clampByte(value).toString(16).padStart(2, '0')).join('')}`;
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function stripUnit(raw: string, unit: string): string {
  return raw.endsWith(unit) ? raw.slice(0, -unit.length) : raw;
}
