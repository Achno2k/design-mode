/**
 * Selector specificity, packed into one comparable number.
 *
 * The browser never says which rule won a property; it only hands back the
 * result. To name the stylesheet value behind a computed one, the matching
 * rules have to be ranked the way the cascade ranks them, and specificity is
 * the first key of that ranking. Ids, classes and types are packed into
 * separate thousands so a thousand classes still lose to one id.
 */
export function specificity(selector: string): number {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let nested = 0;
  let index = 0;

  while (index < selector.length) {
    const char = selector[index] ?? '';

    if (char === '\\') {
      index += 2;
    } else if (char === '[') {
      index = closingIndex(selector, index, '[', ']') + 1;
      classes += 1;
    } else if (char === '#') {
      index = identifierEnd(selector, index + 1);
      ids += 1;
    } else if (char === '.') {
      index = identifierEnd(selector, index + 1);
      classes += 1;
    } else if (char === ':') {
      const pseudo = readPseudo(selector, index);
      index = pseudo.end;
      if (pseudo.isElement) types += 1;
      else if (pseudo.arguments === null) classes += NO_WEIGHT.has(pseudo.name) ? 0 : 1;
      else if (ARGUMENT_WEIGHT.has(pseudo.name)) nested += mostSpecific(pseudo.arguments);
      else if (!NO_WEIGHT.has(pseudo.name)) classes += 1;
    } else if (isIdentifierChar(char)) {
      index = identifierEnd(selector, index);
      types += 1;
    } else {
      index += 1;
    }
  }

  return ids * 1_000_000 + classes * 1_000 + types + nested;
}

/** Split a selector list on the commas that are not inside brackets or quotes. */
export function splitSelectorList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
    } else if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** `:where()` adds nothing; `:is()`, `:not()` and `:has()` count their heaviest argument. */
const NO_WEIGHT = new Set(['where']);
const ARGUMENT_WEIGHT = new Set(['is', 'not', 'has', 'matches', '-webkit-any']);
/** The pseudo-elements CSS 1 spelled with a single colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

function readPseudo(
  selector: string,
  start: number,
): { name: string; isElement: boolean; arguments: string | null; end: number } {
  const doubleColon = selector[start + 1] === ':';
  const nameStart = start + (doubleColon ? 2 : 1);
  const nameEnd = identifierEnd(selector, nameStart);
  const name = selector.slice(nameStart, nameEnd).toLowerCase();

  if (selector[nameEnd] !== '(') {
    return { name, isElement: doubleColon || LEGACY_PSEUDO_ELEMENTS.has(name), arguments: null, end: nameEnd };
  }
  const close = closingIndex(selector, nameEnd, '(', ')');
  return {
    name,
    isElement: doubleColon,
    arguments: selector.slice(nameEnd + 1, close),
    end: close + 1,
  };
}

function mostSpecific(selectorList: string): number {
  return Math.max(0, ...splitSelectorList(selectorList).map(specificity));
}

/** Index of the bracket that closes the one at `open`, or the end of the string. */
function closingIndex(text: string, open: number, opener: string, closer: string): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
    } else if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function identifierEnd(text: string, from: number): number {
  let index = from;
  while (index < text.length) {
    const char = text[index] ?? '';
    if (char === '\\') index += 2;
    else if (isIdentifierChar(char)) index += 1;
    else break;
  }
  return index;
}

function isIdentifierChar(char: string): boolean {
  return /[\w-]/.test(char) || char.charCodeAt(0) > 127;
}
