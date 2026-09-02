/** Attributes that identify a component more reliably than a generated class name. */
const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'data-cy', 'name'];

/** Class names that change between builds and would make a selector useless. */
const GENERATED_CLASS = /^(css-|sc-|jsx-|_|[a-z]+_[a-z0-9]{5,}$)/i;

/** Path segment that stands for "enter this element's shadow root". */
export const SHADOW_SEGMENT = '::shadow';

/**
 * Build a CSS selector that finds this element again.
 *
 * Walks up the tree, stopping as soon as the path is unique, so the result is
 * the shortest thing that still resolves. Ids and test attributes short-circuit
 * the walk because they survive re-renders and refactors.
 *
 * Best effort against the top document only: an element inside a shadow root
 * cannot be reached by one selector, so `buildPath` is the one to keep.
 */
export function buildSelector(element: Element): string {
  return buildSelectorIn(element, document);
}

/**
 * One selector per document scope, outermost first.
 *
 * `['x-card', '::shadow', 'button.primary']` means: find `x-card`, enter its
 * shadow root, find `button.primary` there. Each selector is unique within its
 * own scope, which a single selector could never promise across a boundary.
 */
export function buildPath(element: Element): string[] {
  const path: string[] = [];

  for (let node: Element | null = element; node !== null; ) {
    const root = node.getRootNode();
    const scope = root instanceof ShadowRoot || root instanceof Document ? root : document;
    path.unshift(buildSelectorIn(node, scope));

    if (!(root instanceof ShadowRoot)) break;
    path.unshift(SHADOW_SEGMENT);
    node = root.host;
  }

  return path;
}

/** Find the element a `buildPath` result points at, or null if the page moved on. */
export function resolvePath(path: string[], root: ParentNode = document): Element | null {
  let scope: ParentNode = root;
  let found: Element | null = null;

  for (const segment of path) {
    if (segment === SHADOW_SEGMENT) {
      const shadow = found?.shadowRoot ?? null;
      if (shadow === null) return null;
      scope = shadow;
      continue;
    }

    found = query(scope, segment);
    if (found === null) return null;
  }

  return found;
}

function buildSelectorIn(element: Element, scope: ParentNode): string {
  const parts: string[] = [];

  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const anchor = uniqueAnchor(node, scope);
    if (anchor !== null) {
      parts.unshift(anchor);
      break;
    }

    parts.unshift(describe(node));

    if (isUnique(parts.join(' > '), element, scope)) break;
  }

  return parts.join(' > ');
}

/** A selector that identifies the element on its own, or null if there is none. */
function uniqueAnchor(node: Element, scope: ParentNode): string | null {
  if (node.id !== '' && isUnique(`#${CSS.escape(node.id)}`, node, scope)) {
    return `#${CSS.escape(node.id)}`;
  }

  for (const attribute of STABLE_ATTRIBUTES) {
    const value = node.getAttribute(attribute);
    if (value === null || value === '') continue;

    const selector = `[${attribute}="${CSS.escape(value)}"]`;
    if (isUnique(selector, node, scope)) return selector;
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

function isUnique(selector: string, element: Element, scope: ParentNode): boolean {
  try {
    const matches = scope.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    // A class name can be syntactically invalid once escaped; treat it as unusable.
    return false;
  }
}

function query(scope: ParentNode, selector: string): Element | null {
  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}
