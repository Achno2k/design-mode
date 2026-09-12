import { captureTabScreenshot } from '../capture/tab.ts';
import { readSourceInPage } from '../inspect/source.ts';
import { installConsoleHookInTab } from '../lib/console-hook-install.ts';
import { fetchTargets, postSend } from '../lib/daemon.ts';
import { relayFrameCommand, relayFrameEvent } from '../lib/frame-relay.ts';
import { startLiveReload } from '../lib/live-reload.ts';
import { fetchPickStatus, postFollowUp } from '../lib/pick-client.ts';
import {
  clearReviewSession,
  fail,
  ok,
  readReviewSession,
  type Answer,
  type BackgroundRequest,
  type ContentRequest,
  writeReviewSession,
} from '../lib/messaging.ts';

/**
 * The service worker.
 *
 * Everything that content scripts are not allowed to do happens here: talking
 * to the daemon (no CORS, because the worker holds the host permission),
 * capturing the tab, and injecting into the page's own world.
 */

chrome.runtime.onMessage.addListener((message: BackgroundRequest, sender, respond) => {
  void handle(message, sender).then(respond);
  // Keeps the message channel open for the async reply.
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-design-mode') void toggleActiveTab();
});

chrome.tabs.onRemoved.addListener((tabId) => void clearReviewSession(tabId));

// Reloading the extension detaches the content scripts on every open page, so
// they are replaced immediately rather than leaving the user to refresh.
chrome.runtime.onInstalled.addListener(() => void refreshOpenTabs());
chrome.runtime.onStartup.addListener(() => void refreshOpenTabs());

startLiveReload();

/** Put the current content script into every page the extension covers. */
async function refreshOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*'] });

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      // A tab can refuse injection while it is still loading or has been
      // discarded; the declared content script covers it once it settles.
      await injectContentScript(tab.id);
    }),
  );
}

async function handle(
  message: BackgroundRequest,
  sender: chrome.runtime.MessageSender,
): Promise<Answer<unknown>> {
  switch (message.kind) {
    case 'get-targets':
      return fetchTargets(message.url);

    case 'send':
      return postSend(message.request);

    case 'read-source':
      return readSourceFromTab(sender.tab?.id, message.marker, message.frameId);

    case 'capture':
      return captureTabScreenshot(sender.tab?.id, sender.tab?.windowId, message.request);

    case 'ensure-content':
      return injectContentScript(message.tabId);

    case 'get-review-session':
      return withSenderTab(sender, readReviewSession);

    case 'save-review-session':
      return withSenderTab(sender, (tabId) => writeReviewSession(tabId, message.session));

    case 'clear-review-session':
      return withSenderTab(sender, clearReviewSession);

    case 'pick-status':
      return fetchPickStatus(message.pickId, message.since);

    case 'follow-up':
      return postFollowUp(message.request);

    case 'install-console-hook':
      return installConsoleHookInTab(sender.tab?.id);

    case 'frame-event':
      return relayFrameEvent(sender, message.event);

    case 'frame-command':
      return relayFrameCommand(sender.tab?.id, message.frameId, message.command);

    default:
      return fail('Unknown request.');
  }
}

function withSenderTab<T>(
  sender: chrome.runtime.MessageSender,
  action: (tabId: number) => Promise<Answer<T>>,
): Promise<Answer<T>> | Answer<never> {
  const tabId = sender.tab?.id;
  return tabId === undefined ? fail('Could not tell which tab owns this review session.') : action(tabId);
}

/**
 * Run the source reader in the page's own JavaScript world.
 *
 * `func` is serialised with `toString()`, which is why `readSourceInPage` has
 * no imports and takes the marker attribute through `args`.
 */
async function readSourceFromTab(
  tabId: number | undefined,
  marker: string,
  frameId?: number,
): Promise<Answer<unknown>> {
  if (tabId === undefined) return fail('Could not tell which tab asked for this.');

  try {
    const [result] = await chrome.scripting.executeScript({
      // Without a frame id the top frame is searched, which is where the
      // marker is unless the element lives in an iframe.
      target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
      world: 'MAIN',
      func: readSourceInPage,
      args: [marker],
    });
    return ok(result?.result ?? null);
  } catch (cause) {
    // A page with a strict policy can refuse the injection; the review is still
    // useful without a source location, so this is reported as "none found".
    console.warn('[nudge] source lookup failed', cause);
    return ok(null);
  }
}

/**
 * Inject the content script into a tab that does not have one.
 *
 * Chrome only runs declared content scripts when a page loads, so any tab that
 * was already open when the extension was installed or reloaded has none. This
 * saves the user from having to work out that a refresh is needed.
 */
async function injectContentScript(tabId: number): Promise<Answer<true>> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return ok(true);
  } catch {
    return fail('Nudge only works on http://localhost pages.');
  }
}

/** Keyboard shortcut path — the popup drives the same content-script message. */
async function toggleActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;

  const current = await chrome.tabs.sendMessage(tab.id, { kind: 'get-design-mode' } satisfies ContentRequest);
  const enabled = current?.ok === true ? !current.value.enabled : true;

  await chrome.tabs.sendMessage(tab.id, { kind: 'set-design-mode', enabled } satisfies ContentRequest);
}
