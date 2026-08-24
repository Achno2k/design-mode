import {
  askBackground,
  fail,
  ok,
  type Answer,
  type ContentRequest,
  type DesignModeState,
} from '../lib/messaging.ts';
import { createController, type Controller } from '../overlay/controller.ts';
import { OVERLAY_CSS } from '../overlay/styles.ts';

/**
 * Runs on every localhost page.
 *
 * It mounts one host element with a shadow root and does nothing else until
 * design mode is switched on, so a page that is never reviewed pays only for an
 * empty div.
 */

const HOST_ID = 'herdr-design-mode-root';

/**
 * Shared with any other copy of this script in the same world.
 *
 * Re-injection creates a fresh module instance, so the live controller is kept
 * on the window instead of in module scope. Every copy then answers with the
 * most recently mounted overlay rather than its own stale one.
 */
const ACTIVE = '__herdrDesignModeActive';
let resumePromise: Promise<void> = Promise.resolve();

function active(): Controller | null {
  return (window as unknown as Record<string, Controller | undefined>)[ACTIVE] ?? null;
}

function mount(): void {
  // Chrome injects content scripts again after an extension reload, and the old
  // overlay would otherwise stay behind and keep handling clicks.
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;

  const layer = document.createElement('div');
  layer.className = 'layer';

  shadow.append(style, layer);
  document.documentElement.append(host);

  const controller = createController(layer, host);
  (window as unknown as Record<string, Controller>)[ACTIVE] = controller;
  resumePromise = resumeSession(controller);

  // Registered unconditionally: after an extension reload the previous listener
  // still exists but can no longer reply, so skipping registration here would
  // leave the page permanently unreachable. Duplicates are harmless because
  // every copy reads the same controller.
  chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, respond) => {
    void handle(message).then(respond);
    // Keeps the message channel open for the async reply.
    return true;
  });
}

async function resumeSession(controller: Controller): Promise<void> {
  const stored = await askBackground({ kind: 'get-review-session' });
  if (stored.ok && stored.value?.open === true && active() === controller) {
    await controller.resume(stored.value);
  }
}

async function handle(message: ContentRequest): Promise<Answer<DesignModeState>> {
  await resumePromise;

  switch (message.kind) {
    case 'set-design-mode': {
      const controller = active();
      if (controller === null) return fail('Design mode is not ready on this page.');

      if (message.enabled) await controller.start();
      else controller.stop();
      return ok(state());
    }

    case 'get-design-mode':
      return ok(state());

    default:
      return fail('Unknown request.');
  }
}

function state(): DesignModeState {
  const controller = active();
  return {
    enabled: controller?.isOpen() ?? false,
    picking: controller?.isPicking() ?? false,
    selectionCount: controller?.selectionCount() ?? 0,
  };
}

mount();
