import type {
  ConsoleEntry,
  ElementSelection,
  FollowUpRequest,
  FollowUpResponse,
  FrameRef,
  PickStatus,
  PickStatusResponse,
  Selection,
  SelectionBox,
  SelectionSource,
  SendRequest,
  SendResponse,
  TargetsResponse,
} from './protocol.ts';

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

/** Review state retained while a tab navigates between pages. */
export interface ReviewSession {
  open: boolean;
  picking: boolean;
  selections: Selection[];
  /** One draft page note per exact URL. */
  pageNotes: Record<string, string>;
  /** The most recently sent review, kept so its agent can be followed. */
  lastPick?: SentPick;
  /** Whether console errors are being collected for this review. */
  consoleCapture?: boolean;
  consoleErrors?: ConsoleEntry[];
}

/** Enough about one sent item to find it on the page again. */
export interface SentPickItem {
  selector: string;
  path?: string[];
  pageUrl: string;
  frame?: FrameRef;
}

/** A review that has been delivered, as far as the extension knows. */
export interface SentPick {
  pickId: string;
  paneId: string;
  notePath: string;
  sentAt: number;
  status: PickStatus;
  /** Last status sequence seen, so the next poll only returns a change. */
  seq: number;
  followUps: number;
  /** Set right before a reload that should outline the sent items afterwards. */
  showOnReload: boolean;
  items: SentPickItem[];
}

/** What a content script in a child frame reports up to the top frame. */
export type FrameEvent =
  | { type: 'hello' }
  | {
      type: 'candidate';
      facts: Omit<ElementSelection, 'comment' | 'source' | 'screenshot'>;
      frameUrl: string;
    }
  | { type: 'hover'; label: string }
  | { type: 'key'; key: 'Escape' | 'toggle' };

/** What the top frame tells the content scripts in child frames to do. */
export type FrameCommand =
  | { type: 'set-picking'; picking: boolean }
  /**
   * Tag the frame's picked element and look its source up in that frame. The
   * frame is told its own id because only the top frame ever learns it.
   */
  | { type: 'read-source'; marker: string; frameId: number }
  | { type: 'capturing'; active: boolean }
  /** Drop the pinned highlight; the top page is done with that candidate. */
  | { type: 'clear' };

/** What a frame answers with: a source location for `read-source`, otherwise just receipt. */
export type FrameCommandResult = SelectionSource | null | true;

export interface CaptureRequest {
  box: SelectionBox;
  pixelRatio: number;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface CapturedScreenshot {
  screenshotBlobId?: string;
  screenshot?: string;
  /** The crop as base64 PNG, for the tray's thumbnail. Never sent or persisted. */
  preview?: string;
  /** Shown in the tray when blob upload fell back to inline delivery. */
  notice?: string;
  /** Added to the review when a complete image could not be captured. */
  incompleteReason?: string;
}

/** Work the background service worker does on behalf of a page or the popup. */
export type BackgroundRequest =
  | { kind: 'get-targets'; url: string }
  | { kind: 'read-source'; marker: string; frameId?: number }
  | { kind: 'capture'; request: CaptureRequest }
  | { kind: 'send'; request: SendRequest }
  | { kind: 'ensure-content'; tabId: number }
  | { kind: 'get-review-session' }
  | { kind: 'save-review-session'; session: ReviewSession }
  | { kind: 'clear-review-session' }
  | { kind: 'pick-status'; pickId: string; since: number }
  | { kind: 'follow-up'; request: FollowUpRequest }
  | { kind: 'install-console-hook' }
  | { kind: 'frame-event'; event: FrameEvent }
  | { kind: 'frame-command'; command: FrameCommand; frameId?: number };

/** What each `BackgroundRequest` resolves to. */
export interface BackgroundResults {
  'get-targets': TargetsResponse;
  'read-source': SelectionSource | null;
  capture: CapturedScreenshot;
  send: SendResponse;
  'ensure-content': true;
  'get-review-session': ReviewSession | null;
  'save-review-session': true;
  'clear-review-session': true;
  'pick-status': PickStatusResponse;
  'follow-up': FollowUpResponse;
  'install-console-hook': true;
  'frame-event': true;
  'frame-command': FrameCommandResult;
}

/** Messages the popup sends into a page's content script. */
export type ContentRequest =
  | { kind: 'set-design-mode'; enabled: boolean }
  | { kind: 'get-design-mode' }
  /** Relayed from a child frame's content script to the top frame. */
  | { kind: 'frame-candidate'; frameId: number; event: FrameEvent }
  /** Relayed from the top frame to a child frame's content script. */
  | { kind: 'frame-command'; command: FrameCommand };

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

/** Capture the visible viewport from background code. */
export async function captureVisibleWindow(windowId: number): Promise<Answer<string>> {
  try {
    return ok(await chrome.tabs.captureVisibleTab(windowId, { format: 'png' }));
  } catch (cause) {
    return fail(describe(cause, 'Chrome could not capture this tab.'));
  }
}

/** Move a tab and wait for two painted frames before it is captured. */
export async function scrollTab(
  tabId: number,
  x: number,
  y: number,
): Promise<Answer<{ x: number; y: number }>> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (left: number, top: number) => {
        const elements = [document.documentElement, document.body].filter(
          (element): element is HTMLElement => element !== null,
        );
        const originals = elements.map((element) => ({
          element,
          behavior: element.style.getPropertyValue('scroll-behavior'),
          behaviorPriority: element.style.getPropertyPriority('scroll-behavior'),
          snap: element.style.getPropertyValue('scroll-snap-type'),
          snapPriority: element.style.getPropertyPriority('scroll-snap-type'),
        }));
        for (const original of originals) {
          original.element.style.setProperty('scroll-behavior', 'auto', 'important');
          original.element.style.setProperty('scroll-snap-type', 'none', 'important');
        }

        window.scrollTo(left, top);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const position = { x: window.scrollX, y: window.scrollY };
        for (const original of originals) {
          original.element.style.setProperty(
            'scroll-behavior',
            original.behavior,
            original.behaviorPriority,
          );
          original.element.style.setProperty('scroll-snap-type', original.snap, original.snapPriority);
        }
        return position;
      },
      args: [x, y],
    });
    return result?.result === undefined
      ? fail('Chrome could not read the page scroll position.')
      : ok(result.result);
  } catch (cause) {
    return fail(describe(cause, 'Chrome could not scroll the page for a full screenshot.'));
  }
}

/** Read a tab-scoped session from extension storage. Background use only. */
export async function readReviewSession(tabId: number): Promise<Answer<ReviewSession | null>> {
  try {
    const key = reviewSessionKey(tabId);
    const stored = await chrome.storage.session.get(key);
    return ok(isReviewSession(stored[key]) ? stored[key] : null);
  } catch (cause) {
    return fail(describe(cause, 'Could not restore the review session.'));
  }
}

/** Save a tab-scoped session so a full-page navigation can restore it. */
export async function writeReviewSession(tabId: number, session: ReviewSession): Promise<Answer<true>> {
  try {
    await chrome.storage.session.set({ [reviewSessionKey(tabId)]: session });
    return ok(true);
  } catch (cause) {
    return fail(describe(cause, 'Could not preserve the review session.'));
  }
}

/** Remove a tab's review state after send, clear, or closing the tab. */
export async function clearReviewSession(tabId: number): Promise<Answer<true>> {
  try {
    await chrome.storage.session.remove(reviewSessionKey(tabId));
    return ok(true);
  } catch (cause) {
    return fail(describe(cause, 'Could not clear the review session.'));
  }
}

function reviewSessionKey(tabId: number): string {
  return `review-session:${tabId}`;
}

function isReviewSession(value: unknown): value is ReviewSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Partial<ReviewSession>;
  return (
    session.open === true &&
    typeof session.picking === 'boolean' &&
    Array.isArray(session.selections) &&
    typeof session.pageNotes === 'object' &&
    session.pageNotes !== null &&
    (session.lastPick === undefined || isSentPick(session.lastPick)) &&
    (session.consoleCapture === undefined || typeof session.consoleCapture === 'boolean') &&
    (session.consoleErrors === undefined || Array.isArray(session.consoleErrors))
  );
}

function isSentPick(value: unknown): value is SentPick {
  if (typeof value !== 'object' || value === null) return false;
  const pick = value as Partial<SentPick>;
  return (
    typeof pick.pickId === 'string' &&
    typeof pick.paneId === 'string' &&
    typeof pick.notePath === 'string' &&
    typeof pick.sentAt === 'number' &&
    typeof pick.status === 'string' &&
    typeof pick.seq === 'number' &&
    typeof pick.followUps === 'number' &&
    typeof pick.showOnReload === 'boolean' &&
    Array.isArray(pick.items)
  );
}

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
