/**
 * Find the components rendered directly inside another component.
 *
 * Dev inspectors stamp every element they compile with the file it was written
 * in, which is the only signal in the DOM that says where one component ends
 * and the next begins. A descendant stamped with a *different* file is a child
 * component; a descendant stamped with the same file is a layout wrapper that
 * belongs to the hovered component, so the walk passes straight through it.
 *
 * Pages built without any inspector carry no such stamps. There the DOM's own
 * children are the only structure available, so they are used instead.
 */

/** Smallest box worth outlining — below this the border is all you would see. */
const MIN_SIZE = 4;
/** More outlines than this stop reading as a tree and start reading as noise. */
const MAX_CHILDREN = 12;
/** Hovering <body> must not walk a whole document on every pointer move. */
const MAX_VISITED = 2000;
/** Wrappers nest, but not this deeply before the answer stops being useful. */
const MAX_DEPTH = 8;

/** The component boundaries immediately inside `element`, nearest first. */
export function findChildComponents(element: Element, host: Element): Element[] {
  const walk = walkToBoundaries(element, host, inheritedSourceFile(element));
  const candidates = walk.sawSource ? walk.found : Array.from(element.children);

  return candidates
    .filter((node) => node !== host && isWorthOutlining(node))
    .slice(0, MAX_CHILDREN)
    .sort(byDocumentOrder);
}

/**
 * Put the survivors back in reading order.
 *
 * The walk has to run breadth-first so the cap keeps the nearest children, but
 * colours are assigned by position in this list — and a palette that runs
 * top-to-bottom down the page is far easier to match back to the tree.
 */
function byDocumentOrder(a: Element, b: Element): number {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) === 0 ? 1 : -1;
}

/**
 * Descend breadth-first, stopping each branch at its first foreign source file.
 *
 * Breadth-first matters: when a component has more children than the cap, the
 * ones nearest the hovered element are the ones a reader expects to see.
 */
function walkToBoundaries(
  root: Element,
  host: Element,
  reference: string | undefined,
): { found: Element[]; sawSource: boolean } {
  const found: Element[] = [];
  let frontier = Array.from(root.children);
  let sawSource = false;
  let visited = 0;

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth += 1) {
    const next: Element[] = [];

    for (const node of frontier) {
      if (node === host || visited >= MAX_VISITED) continue;
      visited += 1;

      const file = ownSourceFile(node);
      if (file !== undefined) sawSource = true;

      if (file !== undefined && file !== reference) found.push(node);
      else next.push(...node.children);
    }

    if (found.length >= MAX_CHILDREN) break;
    frontier = next;
  }

  return { found, sawSource };
}

/**
 * The file this element was written in, from the element itself only.
 *
 * Inspectors disagree on the attribute: the Vue one packs `path:line:column`
 * into a single value, while the React and universal ones keep the path in its
 * own attribute.
 */
function ownSourceFile(node: Element): string | undefined {
  const relative = node.getAttribute('data-inspector-relative-path');
  if (relative !== null && relative !== '') return relative;

  const packed = node.getAttribute('data-v-inspector');
  if (packed === null) return undefined;

  const file = packed.replace(/(:\d+){1,2}$/, '');
  return file === '' ? undefined : file;
}

/**
 * The file the hovered element belongs to.
 *
 * Unstamped nodes inherit from their nearest stamped ancestor, so hovering a
 * plain wrapper inside a component still compares against that component.
 */
function inheritedSourceFile(element: Element): string | undefined {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const file = ownSourceFile(node);
    if (file !== undefined) return file;
  }
  return undefined;
}

/** Skip anything collapsed, hidden, or scrolled out of sight. */
function isWorthOutlining(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  return (
    rect.width >= MIN_SIZE &&
    rect.height >= MIN_SIZE &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}
