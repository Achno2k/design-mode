import { checkHealth } from '../lib/daemon.ts';
import { annotateKeys, readShortcutKeys } from '../lib/shortcut.ts';
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
const status = element<HTMLParagraphElement>('status');
const toggle = element<HTMLButtonElement>('toggle');
const refresh = element<HTMLButtonElement>('refresh');
const shortcut = element<HTMLElement>('shortcut');
const annotateKey = element<HTMLElement>('annotate-key');

let tabId: number | undefined;

void start();

async function start(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;

  showKeys(shortcut, (await readShortcutKeys('toggle-design-mode')) ?? ['unassigned']);
  showKeys(annotateKey, annotateKeys());

  refresh.addEventListener('click', () => void reconnect());
  toggle.addEventListener('click', () => void flip());
  await reconnect();
}

/** Check the daemon, then the page, reporting whichever step fails. */
async function reconnect(): Promise<void> {
  refresh.dataset.busy = 'true';
  refresh.disabled = true;
  toggle.disabled = true;

  try {
    const health = await checkHealth();
    dot.dataset.up = String(health.ok);

    if (!health.ok) {
      showStatus(health.error, 'error');
      return;
    }

    showStatus('Daemon connected');
    await load();
  } finally {
    delete refresh.dataset.busy;
    refresh.disabled = false;
  }
}

async function load(): Promise<void> {
  if (tabId === undefined) return;

  const state = await reachPage();
  if (!state.ok) {
    showStatus(state.error, 'error');
    return;
  }

  toggle.disabled = false;
  toggle.dataset.on = String(state.value.enabled);
  toggle.textContent = state.value.enabled ? 'End session' : 'Start session';

  if (state.value.enabled) {
    const picked = state.value.selectionCount;
    const mode = state.value.picking ? 'Annotating' : 'Page interactive';
    showStatus(picked === 0 ? mode : `${mode} · ${picked} selected`);
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
    showStatus(state.error, 'error');
    return;
  }

  await load();
  // The overlay is on the page, so there is nothing left to do in the popup.
  if (enabled) window.close();
}

function showStatus(text: string, tone: 'normal' | 'error' = 'normal'): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

/** One chip per key, the way the design spells a shortcut out. */
function showKeys(slot: HTMLElement, keys: string[]): void {
  slot.replaceChildren(
    ...keys.map((key) => {
      const chip = document.createElement('kbd');
      chip.textContent = key;
      return chip;
    }),
  );
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`popup.html is missing #${id}`);
  return found as T;
}
