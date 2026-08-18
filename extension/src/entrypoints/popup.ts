import { checkHealth } from '../lib/daemon.ts';
import { readShortcut } from '../lib/shortcut.ts';
import {
  askBackground,
  askContent,
  fail,
  type Answer,
  type DesignModeState,
} from '../lib/messaging.ts';

/**
 * The toolbar popup.
 *
 * Deliberately thin: it reports whether the daemon is reachable and toggles
 * design mode. Choosing an agent and sending happen in the overlay, next to the
 * elements being reviewed.
 */

const dot = element<HTMLSpanElement>('dot');
const status = element<HTMLSpanElement>('status');
const toggle = element<HTMLButtonElement>('toggle');
const shortcut = element<HTMLElement>('shortcut');
const annotateKey = element<HTMLElement>('annotate-key');

let tabId: number | undefined;

void start();

async function start(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;

  shortcut.textContent = (await readShortcut('toggle-design-mode')) ?? 'unassigned';
  // Handled by the page rather than chrome.commands, so it is stated directly.
  annotateKey.textContent = isMac() ? '⌘.' : 'Ctrl+.';

  const health = await checkHealth();
  dot.dataset.up = String(health.ok);

  if (!health.ok) {
    status.textContent = health.error;
    return;
  }

  status.textContent = 'Daemon connected';
  await refresh();
  toggle.addEventListener('click', () => void flip());
}

async function refresh(): Promise<void> {
  if (tabId === undefined) return;

  const state = await reachPage();
  if (!state.ok) {
    status.textContent = state.error;
    return;
  }

  toggle.disabled = false;
  toggle.dataset.on = String(state.value.enabled);
  toggle.textContent = state.value.enabled ? 'End session' : 'Start session';

  if (state.value.enabled) {
    const picked = state.value.selectionCount;
    const mode = state.value.picking ? 'Annotating' : 'Page interactive';
    status.textContent = picked === 0 ? mode : `${mode} · ${picked} selected`;
  }
}

/**
 * Talk to the page, injecting design mode first if it is not there.
 *
 * A tab that was already open when the extension was installed or reloaded has
 * no content script, because Chrome only runs declared ones on page load.
 * Injecting on demand saves the user from having to work that out.
 */
async function reachPage(): Promise<Answer<DesignModeState>> {
  if (tabId === undefined) return fail('No active tab.');

  const first = await askContent(tabId, { kind: 'get-design-mode' });
  if (first.ok) return first;

  const injected = await askBackground({ kind: 'ensure-content', tabId });
  if (!injected.ok) return injected;

  return askContent(tabId, { kind: 'get-design-mode' });
}

async function flip(): Promise<void> {
  if (tabId === undefined) return;

  const enabled = toggle.dataset.on !== 'true';
  const state = await askContent(tabId, { kind: 'set-design-mode', enabled });

  if (!state.ok) {
    status.textContent = state.error;
    return;
  }

  await refresh();
  // The overlay is on the page, so there is nothing left to do in the popup.
  if (enabled) window.close();
}

function isMac(): boolean {
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return (modern?.platform ?? navigator.platform).toLowerCase().includes('mac');
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`popup.html is missing #${id}`);
  return found as T;
}
