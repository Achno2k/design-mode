import { askBackground, type Answer } from '../lib/messaging.ts';
import type { ElementContext, ElementSelection, SelectionBox, SelectionSource } from '../lib/protocol.ts';
import { SOURCE_MARKER } from '../inspect/marker.ts';
import { buildSelector, stableClasses } from '../inspect/selector.ts';
import { readStyles, readText } from '../inspect/styles.ts';

/** Everything about an element that can be read synchronously from the page. */
export type ElementFacts = Omit<ElementSelection, 'comment' | 'source' | 'screenshot'>;

/** Measure and describe an element. Cheap, and safe to call on every click. */
export function describeElement(element: Element): ElementFacts {
  return {
    kind: 'element',
    tag: element.tagName.toLowerCase(),
    selector: buildSelector(element),
    classes: stableClasses(element),
    text: readText(element),
    box: measure(element),
    styles: readStyles(element),
    context: readElementContext(element),
  };
}

/** Current position of an element, in CSS pixels relative to the viewport. */
export function measure(element: Element): SelectionBox {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/**
 * Ask the page's own world where this component was declared.
 *
 * The element is tagged with an attribute first because a DOM node cannot be
 * passed to an injected script — see `inspect/source.ts` for why the lookup has
 * to happen over there at all. The tag is always removed, including on failure,
 * so a stale marker can never point the next lookup at the wrong element.
 */
export async function readSource(element: Element): Promise<SelectionSource | undefined> {
  element.setAttribute(SOURCE_MARKER, '');
  try {
    const answer = await askBackground({ kind: 'read-source', marker: SOURCE_MARKER });
    return answer.ok && answer.value !== null ? answer.value : undefined;
  } finally {
    element.removeAttribute(SOURCE_MARKER);
  }
}

/**
 * Crop the element out of a screenshot of the tab.
 *
 * A missing screenshot does not fail the review, but the reason is passed back
 * so the tray can say so — an image that quietly never arrives is worse than
 * one that is reported missing.
 */
export async function captureElement(box: SelectionBox): Promise<Answer<string | null>> {
  return askBackground({ kind: 'capture', box, pixelRatio: window.devicePixelRatio });
}

/** Short label for the popover, so the user can see what they clicked. */
export function describeForHuman(facts: ElementFacts): string {
  const classes = facts.classes.slice(0, 2).map((name) => `.${name}`).join('');
  return `<${facts.tag}>${classes}`;
}

const USEFUL_ATTRIBUTES = ['href', 'name', 'placeholder', 'type', 'alt'] as const;
const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

/** Accessibility and DOM hints that help an agent identify intent, not noise. */
function readElementContext(element: Element): ElementContext {
  const context: ElementContext = { attributes: readUsefulAttributes(element) };
  const role = readRole(element);
  const accessibleName = readAccessibleName(element);
  const nearestHeading = readNearestHeading(element);

  if (role !== undefined) context.role = role;
  if (accessibleName !== undefined) context.accessibleName = accessibleName;
  if (isDisabled(element)) context.disabled = true;
  if (nearestHeading !== undefined) context.nearestHeading = nearestHeading;

  return context;
}

function readUsefulAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const name of USEFUL_ATTRIBUTES) {
    const value = clean(element.getAttribute(name));
    if (value !== undefined) attributes[name] = value;
  }

  return attributes;
}

function readRole(element: Element): string | undefined {
  const explicit = clean(element.getAttribute('role'));
  if (explicit !== undefined) return explicit;

  const tag = element.tagName.toLowerCase();
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'img') return 'img';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'option') return 'option';
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (tag === 'form') return 'form';
  if (tag === 'table') return 'table';
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'li') return 'listitem';
  if (/^h[1-6]$/.test(tag)) return 'heading';

  if (element instanceof HTMLInputElement) {
    switch (element.type) {
      case 'button':
      case 'reset':
      case 'submit':
        return 'button';
      case 'checkbox':
      case 'radio':
      case 'range':
        return element.type;
      default:
        return 'textbox';
    }
  }

  return undefined;
}

function readAccessibleName(element: Element): string | undefined {
  const labelledBy = readLabelledBy(element);
  if (labelledBy !== undefined) return labelledBy;

  const aria = clean(element.getAttribute('aria-label'));
  if (aria !== undefined) return aria;

  const label = readAssociatedLabel(element);
  if (label !== undefined) return label;

  const alt = clean(element.getAttribute('alt'));
  if (alt !== undefined) return alt;

  const title = clean(element.getAttribute('title'));
  if (title !== undefined) return title;

  const tag = element.tagName.toLowerCase();
  const role = readRole(element);
  if (tag === 'button' || tag === 'summary' || tag === 'label' || role === 'button' || role === 'link') {
    return clean(readText(element));
  }

  return undefined;
}

function readLabelledBy(element: Element): string | undefined {
  const ids = clean(element.getAttribute('aria-labelledby'))?.split(/\s+/) ?? [];
  if (ids.length === 0) return undefined;

  const text = ids.map((id) => clean(readTextById(id))).filter((value) => value !== undefined).join(' ');
  return clean(text);
}

function readTextById(id: string): string | undefined {
  // getElementById accepts unusual IDs literally and never parses them as CSS.
  const referenced = document.getElementById(id);
  return referenced === null ? undefined : readText(referenced);
}

function readAssociatedLabel(element: Element): string | undefined {
  if ('labels' in element) {
    const labels = (element as { labels?: NodeListOf<HTMLLabelElement> | null }).labels;
    const text = Array.from(labels ?? [], (label) => readText(label)).join(' ');
    return clean(text);
  }

  const id = element.getAttribute('id');
  if (id === null || id === '') return undefined;

  const label = Array.from(document.querySelectorAll('label[for]')).find(
    (candidate): candidate is HTMLLabelElement => candidate instanceof HTMLLabelElement && candidate.htmlFor === id,
  );
  return label === undefined ? undefined : clean(readText(label));
}

function isDisabled(element: Element): boolean {
  if (element.getAttribute('aria-disabled') === 'true') return true;
  if ('disabled' in element && Boolean((element as { disabled?: boolean }).disabled)) return true;
  return isDisabledByFieldset(element);
}

function isDisabledByFieldset(element: Element): boolean {
  if (!isFormControl(element)) return false;

  const fieldset = element.closest('fieldset[disabled]');
  if (!(fieldset instanceof HTMLFieldSetElement)) return false;

  const firstLegend = Array.from(fieldset.children).find(
    (child): child is HTMLLegendElement => child instanceof HTMLLegendElement,
  );
  return firstLegend === undefined || !firstLegend.contains(element);
}

function isFormControl(element: Element): boolean {
  return element.matches('button,input,select,textarea,option,optgroup');
}

function readNearestHeading(element: Element): string | undefined {
  const ancestorHeading = element.closest(HEADING_SELECTOR);
  if (ancestorHeading !== null) return clean(readText(ancestorHeading));

  let nearest: string | undefined;
  for (const heading of document.querySelectorAll(HEADING_SELECTOR)) {
    if (heading === element || heading.contains(element)) return clean(readText(heading));

    const position = heading.compareDocumentPosition(element);
    if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      nearest = clean(readText(heading)) ?? nearest;
      continue;
    }
    if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) break;
  }
  return nearest;
}

function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized === '' ? undefined : normalized;
}
