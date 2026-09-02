import type { PseudoStyle } from '../lib/protocol.ts';
import { forEachStyleRule, sheetName, stripPseudo } from './cssom.ts';

/**
 * Read the authored rules that style an element while it is hovered, focused,
 * or pressed.
 *
 * A computed style only ever describes the state the element is in right now,
 * so "the hover colour is wrong" would otherwise arrive with nothing to act on.
 * The rules are found in the stylesheets instead: every selector naming an
 * interactive state is tested against the element with that state removed, so
 * `.btn:hover` is reported when the element matches `.btn`.
 */

/** Matches the daemon's cap, so nothing collected here is silently dropped. */
const MAX_PSEUDO_STYLES = 20;

// `(?![\w-])` rather than `\b`, so `:focus-within` is not read as `:focus`.
const PSEUDO_PATTERN = /:(hover|focus-visible|focus|active)(?![\w-])/;

export function readPseudoStyles(element: Element): PseudoStyle[] {
  const found = new Map<string, PseudoStyle>();

  forEachStyleRule(stylesheetRoot(element), (rule, sheet) => {
    collectRule(element, rule, sheet, found);
  });

  return Array.from(found.values()).slice(0, MAX_PSEUDO_STYLES);
}

/**
 * Which stylesheets can reach this element.
 *
 * Only the element's own tree scope is walked. A document rule cannot style an
 * element inside a shadow root, and reporting one that merely matches its
 * classes would put a fact in the review that is not true of the page.
 */
function stylesheetRoot(element: Element): Document | ShadowRoot {
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) return root;
  return root instanceof Document ? root : element.ownerDocument;
}

function collectRule(
  element: Element,
  rule: CSSStyleRule,
  sheet: CSSStyleSheet,
  found: Map<string, PseudoStyle>,
): void {
  // Cheap gate first: most rules in a utility framework name no state at all,
  // and reading their declarations is the expensive part of this walk.
  if (!PSEUDO_PATTERN.test(rule.selectorText)) return;

  const declarations = readDeclarations(rule.style);
  if (Object.keys(declarations).length === 0) return;

  const sheetLabel = sheetName(sheet);
  for (const selector of splitSelectorList(rule.selectorText)) {
    const pseudo = readPseudo(selector);
    if (pseudo === undefined || !appliesTo(element, selector)) continue;

    const key = `${pseudo}|${selector}|${sheetLabel ?? ''}`;
    const existing = found.get(key);
    // The same selector later in the cascade wins, so its values replace.
    if (existing === undefined) {
      found.set(key, {
        pseudo,
        selector,
        ...(sheetLabel === undefined ? {} : { sheet: sheetLabel }),
        declarations,
      });
    } else {
      Object.assign(existing.declarations, declarations);
    }
  }
}

function readPseudo(selector: string): PseudoStyle['pseudo'] | undefined {
  const match = PSEUDO_PATTERN.exec(selector);
  return match === null ? undefined : (`:${match[1]}` as PseudoStyle['pseudo']);
}

/**
 * Whether the rule would style this element once the state is entered.
 *
 * The state is stripped before testing because `element.matches(':hover')` is
 * false until the pointer is actually over it. A bare `:hover` selector strips
 * to nothing: it applies to the whole page and says nothing about this element.
 */
function appliesTo(element: Element, selector: string): boolean {
  const base = stripPseudo(selector);
  if (base === '') return false;

  try {
    return element.matches(base);
  } catch {
    // Pseudo-elements and selectors this browser cannot parse: not a match.
    return false;
  }
}

/**
 * Shorthands the CSSOM expands into longhands. When the rule set one of these,
 * it is reported as written and its longhands are folded away, so
 * `background: #333` does not arrive as nine `initial` lines.
 */
const SHORTHANDS = [
  'background',
  'border',
  'border-radius',
  'font',
  'margin',
  'padding',
  'inset',
  'outline',
  'gap',
  'flex',
  'transition',
  'animation',
  'grid-area',
  'place-items',
];

function readDeclarations(style: CSSStyleDeclaration): Record<string, string> {
  const declarations: Record<string, string> = {};
  const folded = new Set<string>();

  for (const shorthand of SHORTHANDS) {
    const value = style.getPropertyValue(shorthand);
    if (value === '') continue;
    declarations[shorthand] = withPriority(value, style.getPropertyPriority(shorthand));
    for (const property of Array.from(style)) {
      if (property.startsWith(`${shorthand}-`)) folded.add(property);
    }
  }

  for (const property of Array.from(style)) {
    if (folded.has(property)) continue;
    const value = style.getPropertyValue(property);
    // `initial` only appears as the residue of a shorthand the browser expanded.
    if (value === '' || value === 'initial') continue;
    declarations[property] = withPriority(value, style.getPropertyPriority(property));
  }

  return declarations;
}

function withPriority(value: string, priority: string): string {
  return priority === '' ? value : `${value} !${priority}`;
}

/** Split `a:hover, b:focus` into its parts, ignoring commas inside `:is(…)`. */
function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < selectorText.length; index += 1) {
    const character = selectorText[index];

    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(selectorText.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(selectorText.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part !== '');
}
