import type { SentPickItem } from '../lib/messaging.ts';

/** Which of a sent review's elements are on this page right now. */
export interface FoundItems {
  found: Element[];
  /** How many of the sent items belong to this page, found or not. */
  total: number;
}

/**
 * Find the elements of a sent review again after the page was reloaded.
 *
 * Items are matched to the page by URL, ignoring the hash, since a router
 * changing the fragment is still the same document. An element inside a frame
 * cannot be outlined from the top document, so the frame itself stands in.
 */
export function findSentItems(items: SentPickItem[], pageUrl: string): FoundItems {
  const here = items.filter((item) => samePage(item.pageUrl, pageUrl));
  const found = here.flatMap((item) => {
    const element = resolveItem(item);
    return element === null ? [] : [element];
  });
  return { found, total: here.length };
}

function resolveItem(item: SentPickItem): Element | null {
  const selector = item.frame?.selector ?? item.selector;
  // Merge note (feat/selection): switch to `resolvePath(item.path)` once
  // `inspect/selector.ts` exports it, so elements behind shadow roots resolve.
  return query(selector);
}

function query(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function samePage(a: string, b: string): boolean {
  return withoutHash(a) === withoutHash(b);
}

function withoutHash(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}
