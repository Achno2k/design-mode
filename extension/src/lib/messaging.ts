import type { SelectionBox, SelectionSource, SendRequest, SendResponse, TargetsResponse } from './protocol.ts';

/**
 * Typed wrappers around `chrome.runtime` messaging.
 *
 * Every `chrome.*` call in this extension goes through here or `daemon.ts`, so
 * the UI never has to think about callback errors or message shapes.
 */

/** Mirrors the daemon's Result type so both sides of the extension read alike. */
export type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Answer<T> {
  return { ok: true, value };
}

export function fail(message: string): Answer<never> {
  return { ok: false, error: message };
}

/** Work the background service worker does on behalf of a page or the popup. */
export type BackgroundRequest =
  | { kind: 'get-targets'; url: string }
  | { kind: 'read-source'; marker: string }
  | { kind: 'capture'; box: SelectionBox; pixelRatio: number }
  | { kind: 'send'; request: SendRequest }
  | { kind: 'ensure-content'; tabId: number };

/** What each `BackgroundRequest` resolves to. */
export interface BackgroundResults {
  'get-targets': TargetsResponse;
  'read-source': SelectionSource | null;
  capture: string | null;
  send: SendResponse;
  'ensure-content': true;
}

/** Messages the popup sends into a page's content script. */
export type ContentRequest =
  | { kind: 'set-design-mode'; enabled: boolean }
  | { kind: 'get-design-mode' };

export interface DesignModeState {
  /** The review session is open: the tray is up and selections are kept. */
  enabled: boolean;
  /** Clicks are being intercepted for picking, rather than reaching the page. */
  picking: boolean;
  selectionCount: number;
}

const STALE =
  'This page is running an old copy of design mode. Reload the page to pick up the new one.';

/**
 * Whether this script still belongs to the installed extension.
 *
 * Reloading or updating an extension leaves the previously injected content
 * scripts running on open pages, but detaches them: `chrome.runtime.id` goes
 * undefined and every call throws "Extension context invalidated". Checking
 * first turns that into an instruction the user can act on.
 */
export function isContextAlive(): boolean {
  return chrome.runtime?.id !== undefined;
}

/** Ask the service worker to do something. */
export async function askBackground<K extends BackgroundRequest['kind']>(
  request: Extract<BackgroundRequest, { kind: K }>,
): Promise<Answer<BackgroundResults[K]>> {
  if (!isContextAlive()) return fail(STALE);

  try {
    return (await chrome.runtime.sendMessage(request)) as Answer<BackgroundResults[K]>;
  } catch (cause) {
    const message = describe(cause, 'The extension background worker did not respond.');
    return fail(message.includes('context invalidated') ? STALE : message);
  }
}

/** Ask a page's content script to do something. */
export async function askContent(
  tabId: number,
  request: ContentRequest,
): Promise<Answer<DesignModeState>> {
  try {
    return (await chrome.tabs.sendMessage(tabId, request)) as Answer<DesignModeState>;
  } catch {
    // Thrown when no content script is listening, which happens both on pages
    // the extension does not cover and on tabs that were already open when it
    // was installed. The caller decides whether to inject and retry.
    return fail('No design mode on this page yet.');
  }
}

function describe(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : fallback;
}
