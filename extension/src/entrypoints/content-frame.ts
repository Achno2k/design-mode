import { buildPath } from '../inspect/selector.ts';
import {
  askBackground,
  ok,
  type Answer,
  type ContentRequest,
  type FrameCommand,
  type FrameCommandResult,
} from '../lib/messaging.ts';
import { describeElement, describeHover } from '../overlay/collect.ts';
import { isAnnotateShortcut } from '../overlay/controller-input.ts';
import { createHighlight } from '../overlay/highlight.ts';
import { createPickInput, type PickInput } from '../overlay/pick-input.ts';
import { BASE_CSS } from '../overlay/styles/base.ts';
import { FRAME_CSS } from '../overlay/styles/frame.ts';
import { THEME_CSS } from '../overlay/styles/theme.ts';

/**
 * Design mode inside a child frame.
 *
 * Pointer events never leave the frame they happen in, so the frame has to do
 * its own hovering and clicking. It keeps only a highlight; a picked element is
 * described and handed up to the top page, which owns the composer, the tray,
 * and the screenshot.
 */

const HOST_ID = 'nudge-frame';
const DESTROY_EVENT = 'nudge-frame-destroy';

interface FrameAgent {
  onCommand(command: FrameCommand): Promise<Answer<FrameCommandResult>>;
  destroy(): void;
}

export function mountFrameAgent(): void {
  // Re-injection replaces the previous agent so two never fight over clicks.
  document.documentElement.dispatchEvent(new CustomEvent(DESTROY_EVENT));
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = [THEME_CSS, BASE_CSS, FRAME_CSS].join('\n');

  const layer = document.createElement('div');
  layer.className = 'layer layer--frame';

  shadow.append(style, layer);
  document.documentElement.append(host);

  const agent = createFrameAgent(layer, host);
  document.documentElement.addEventListener(DESTROY_EVENT, () => agent.destroy(), { once: true });

  chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, respond) => {
    // Broadcasts meant for the top page must get no answer from here: Chrome
    // takes the first reply, and a frame's would shadow the real one.
    if (message.kind !== 'frame-command') return false;
    void agent.onCommand(message.command).then(respond);
    return true;
  });

  void askBackground({ kind: 'frame-event', event: { type: 'hello' } });
}

function createFrameAgent(layer: HTMLElement, host: Element): FrameAgent {
  const highlight = createHighlight(layer, host);
  let picking = false;
  let announcedHover = false;
  /** The element handed up and not yet released by the top page's composer. */
  let pending: Element | null = null;

  const pickInput: PickInput = createPickInput({
    host,
    highlight,
    // The composer lives in the top page. While it is open on an element from
    // here, hovering must not move the pinned box, and a click closes it there
    // just as a click on the top page would.
    composer: {
      isOpen: () => pending !== null,
      close: () => void askBackground({ kind: 'frame-event', event: { type: 'key', key: 'Escape' } }),
    },
    onPick: (element) => {
      pending = element;
      void askBackground({
        kind: 'frame-event',
        event: {
          type: 'candidate',
          facts: { ...describeElement(element), path: buildPath(element) },
          frameUrl: window.location.href,
        },
      });
    },
  });

  function setPicking(next: boolean): void {
    if (picking === next) return;
    picking = next;
    if (next) pickInput.attach();
    else pickInput.detach();
    if (!next) release();
    announcedHover = false;
  }

  /** The top page is done with the candidate; hover takes over again. */
  function release(): void {
    pending = null;
    pickInput.setCurrent(null);
  }

  /** Once per entry: the top page hides its own box when the pointer is in here. */
  function onPointerMove(): void {
    if (!picking || announcedHover) return;
    announcedHover = true;
    const current = pickInput.current();
    const label = current === null ? '' : describeHover(current);
    void askBackground({ kind: 'frame-event', event: { type: 'hover', label } });
  }

  function onPointerLeave(): void {
    announcedHover = false;
    if (picking) pickInput.setCurrent(null);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (isAnnotateShortcut(event)) {
      event.preventDefault();
      void askBackground({ kind: 'frame-event', event: { type: 'key', key: 'toggle' } });
      return;
    }
    if (event.key === 'Escape' && picking) {
      event.preventDefault();
      void askBackground({ kind: 'frame-event', event: { type: 'key', key: 'Escape' } });
    }
  }

  async function readSource(marker: string, frameId: number): Promise<Answer<FrameCommandResult>> {
    const element = pending;
    if (element === null) return ok(null);

    // Same contract as `collect.readSource`: the tag must never outlive the lookup.
    element.setAttribute(marker, '');
    try {
      const answer = await askBackground({ kind: 'read-source', marker, frameId });
      return answer.ok ? ok(answer.value) : answer;
    } finally {
      element.removeAttribute(marker);
    }
  }

  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('keydown', onKeyDown, true);
  document.documentElement.addEventListener('mouseleave', onPointerLeave);

  return {
    async onCommand(command) {
      switch (command.type) {
        case 'set-picking':
          setPicking(command.picking);
          return ok(true);
        case 'read-source':
          return readSource(command.marker, command.frameId);
        case 'capturing':
          layer.classList.toggle('layer--capturing', command.active);
          return ok(true);
        case 'clear':
          release();
          return ok(true);
      }
    },
    destroy() {
      setPicking(false);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('keydown', onKeyDown, true);
      document.documentElement.removeEventListener('mouseleave', onPointerLeave);
      host.remove();
    },
  };
}
