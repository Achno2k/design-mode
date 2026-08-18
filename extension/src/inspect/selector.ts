/** Attributes that identify a component more reliably than a generated class name. */
const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'data-cy', 'name'];

/** Class names that change between builds and would make a selector useless. */
const GENERATED_CLASS = /^(css-|sc-|jsx-|_|[a-z]+_[a-z0-9]{5,}$)/i;

/**
 * Build a CSS selector that finds this element again.
 *
 * Walks up the tree, stopping as soon as the path is unique, so the result is
 * the shortest thing that still resolves. Ids and test attributes short-circuit
 * the walk because they survive re-renders and refactors.
 */
export function buildSelector(element: Element): string {
  const parts: string[] = [];

  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const anchor = uniqueAnchor(node);
    if (anchor !== null) {
      parts.unshift(anchor);
      break;
    }

    parts.unshift(describe(node));

    if (isUnique(parts.join(' > '), element)) break;
  }

  return parts.join(' > ');
}

/** A selector that identifies the element on its own, or null if there is none. */
function uniqueAnchor(node: Element): string | null {
  if (node.id !== '' && isUnique(`#${CSS.escape(node.id)}`, node)) {
    return `#${CSS.escape(node.id)}`;
  }

  for (const attribute of STABLE_ATTRIBUTES) {
    const value = node.getAttribute(attribute);
    if (value === null || value === '') continue;

    const selector = `[${attribute}="${CSS.escape(value)}"]`;
    if (isUnique(selector, node)) return selector;
  }

  return null;
}

/** Tag plus a stable class, narrowed by position when siblings share the shape. */
function describe(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const className = stableClasses(node)[0];
  const base = className === undefined ? tag : `${tag}.${CSS.escape(className)}`;

  const position = positionAmongSiblings(node);
  return position === null ? base : `${base}:nth-of-type(${position})`;
}

function positionAmongSiblings(node: Element): number | null {
  const siblings = [...(node.parentElement?.children ?? [])].filter(
    (sibling) => sibling.tagName === node.tagName,
  );
  return siblings.length < 2 ? null : siblings.indexOf(node) + 1;
}

/** Class names worth putting in a selector — hashed build output is skipped. */
export function stableClasses(element: Element): string[] {
  return [...element.classList].filter((name) => !GENERATED_CLASS.test(name));
}

function isUnique(selector: string, element: Element): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    // A class name can be syntactically invalid once escaped; treat it as unusable.
    return false;
  }
}
