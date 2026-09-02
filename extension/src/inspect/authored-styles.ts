import { forEachStyleRule, sheetName } from './cssom.ts';
import { specificity, splitSelectorList } from './specificity.ts';

/** A rule that applies to the element right now, with the keys the cascade sorts by. */
export interface MatchedRule {
  /** The part of the rule's selector list that matched. */
  selector: string;
  sheet?: string;
  style: CSSStyleDeclaration;
  specificity: number;
  /** Position in the walk; later rules win ties. */
  order: number;
}

/** The value as the stylesheet wrote it, and the rule it was read from. */
export interface AuthoredValue {
  value: string;
  selector: string;
  sheet?: string;
  /** Classes on the element that the selector names, e.g. Tailwind utilities. */
  classes?: string[];
}

/**
 * Every rule whose selector matches the element, sorted lowest priority first.
 *
 * One walk serves every property the editor asks about afterwards. Cascade
 * layers are not modelled: rules are ranked by specificity and source order
 * alone, which is right within one layer and for unlayered stylesheets.
 */
export function collectMatchingRules(element: Element): MatchedRule[] {
  const root = element.getRootNode();
  if (!(root instanceof Document || root instanceof ShadowRoot)) return [];

  const rules: MatchedRule[] = [];
  let order = 0;
  forEachStyleRule(root, (rule, sheet) => {
    order += 1;
    const match = bestMatchingPart(element, rule.selectorText);
    if (match === null) return;
    const name = sheetName(sheet);
    rules.push({
      selector: match.selector,
      ...(name === undefined ? {} : { sheet: name }),
      style: rule.style,
      specificity: match.specificity,
      order,
    });
  });

  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

/**
 * Longhands the editor's shorthand rows stand for. A rule that sets only
 * `padding-left` still authors part of `padding`, and the CSSOM only reports a
 * shorthand when every one of its longhands was set by the same declaration.
 */
const LONGHANDS: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  gap: ['row-gap', 'column-gap'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-radius': [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ],
};

/** The declaration that wins `property` on the element, or nothing when no rule sets it. */
export function readAuthoredValue(
  rules: MatchedRule[],
  element: Element,
  property: string,
): AuthoredValue | undefined {
  const longhands = LONGHANDS[property];
  if (longhands === undefined) {
    const winner = findWinner(rules, element, property);
    return winner === undefined ? undefined : describe(element, winner.value, [winner.source]);
  }

  const winners = longhands.map((longhand) => findWinner(rules, element, longhand, property));
  const found = winners.filter((winner) => winner !== undefined);
  if (found.length === 0) return undefined;

  // One declaration set every side: report it the way it was written.
  const first = found[0];
  if (first !== undefined && found.length === longhands.length) {
    const shorthand = first.source.style.getPropertyValue(property);
    if (shorthand !== '' && found.every((winner) => winner.source.style === first.source.style)) {
      return describe(element, shorthand, [first.source]);
    }
  }

  // Sides came from different rules, or some were never set: compose the
  // shorthand from what each side resolved to and credit every rule involved.
  const computed = window.getComputedStyle(element);
  const values = winners.map((winner, index) =>
    winner === undefined ? computed.getPropertyValue(longhands[index] ?? '').trim() : winner.value,
  );
  return describe(element, collapseSides(values), found.map((winner) => winner.source));
}

type Source = { selector: string; sheet?: string; style: CSSStyleDeclaration };
type Winner = { value: string; important: boolean; rank: number; source: Source };

/**
 * Inline beats rules of the same importance; among rules the sort order decides.
 *
 * A shorthand written with `var()` cannot be split into sides until the
 * variable resolves, so the CSSOM reports its longhands as empty. Asking for
 * the shorthand as well keeps `padding: var(--space-4)` visible.
 */
function findWinner(
  rules: MatchedRule[],
  element: Element,
  property: string,
  shorthand?: string,
): Winner | undefined {
  const declared = (style: CSSStyleDeclaration): string =>
    style.getPropertyValue(property) || (shorthand === undefined ? '' : style.getPropertyValue(shorthand));
  const priority = (style: CSSStyleDeclaration): boolean =>
    style.getPropertyPriority(property) === 'important' ||
    (shorthand !== undefined && style.getPropertyPriority(shorthand) === 'important');

  let best: Winner | undefined;
  const inline = inlineStyle(element);
  if (inline !== null && declared(inline) !== '') {
    best = {
      value: declared(inline).trim(),
      important: priority(inline),
      rank: Number.POSITIVE_INFINITY,
      source: { selector: 'style attribute', style: inline },
    };
  }

  rules.forEach((rule, rank) => {
    const value = declared(rule.style);
    if (value === '') return;
    const important = priority(rule.style);
    const beats =
      best === undefined ||
      (important && !best.important) ||
      (important === best.important && rank > best.rank);
    if (beats) {
      best = {
        value: value.trim(),
        important,
        rank,
        source: {
          selector: rule.selector,
          ...(rule.sheet === undefined ? {} : { sheet: rule.sheet }),
          style: rule.style,
        },
      };
    }
  });

  return best;
}

function describe(element: Element, value: string, sources: Source[]): AuthoredValue {
  const selectors = Array.from(new Set(sources.map((source) => source.selector)));
  const sheets = new Set(sources.map((source) => source.sheet));
  const sheet = sheets.size === 1 ? sources[0]?.sheet : undefined;
  const classes = classesNamed(element, selectors.join(', '));
  return {
    value,
    selector: selectors.join(', '),
    ...(sheet === undefined ? {} : { sheet }),
    ...(classes.length === 0 ? {} : { classes }),
  };
}

/** The element's own classes that the selector mentions, in the element's order. */
function classesNamed(element: Element, selector: string): string[] {
  const named = new Set<string>();
  for (const match of selector.matchAll(/\.((?:\\.|[^\s.#:[\]()>+~,\\])+)/g)) {
    named.add((match[1] ?? '').replace(/\\(.)/g, '$1'));
  }
  return Array.from(element.classList).filter((name) => named.has(name));
}

/** The highest-specificity part of a selector list that matches the element. */
function bestMatchingPart(
  element: Element,
  selectorText: string,
): { selector: string; specificity: number } | null {
  let best: { selector: string; specificity: number } | null = null;
  for (const part of splitSelectorList(selectorText)) {
    if (!matches(element, part)) continue;
    const weight = specificity(part);
    if (best === null || weight > best.specificity) best = { selector: part, specificity: weight };
  }
  return best;
}

/** Pseudo-elements and nested `&` selectors make `matches` throw; neither styles the element itself. */
function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function inlineStyle(element: Element): CSSStyleDeclaration | null {
  return element instanceof HTMLElement || element instanceof SVGElement ? element.style : null;
}

/** Write four (or two) sides the short way CSS allows: `8px`, `8px 16px`, `8px 16px 4px`. */
function collapseSides(values: string[]): string {
  const [top = '', right = top, bottom = top, left = right] = values;
  if (values.length === 2) return top === right ? top : `${top} ${right}`;
  if (left !== right) return `${top} ${right} ${bottom} ${left}`;
  if (bottom !== top) return `${top} ${right} ${bottom}`;
  return right !== top ? `${top} ${right}` : top;
}
