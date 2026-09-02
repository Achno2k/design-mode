import { SOURCE_MARKER } from '../inspect/marker.ts';
import { buildSelector } from '../inspect/selector.ts';
import {
  askBackground,
  fail,
  ok,
  type Answer,
  type FrameCommand,
  type FrameEvent,
} from '../lib/messaging.ts';
import type { SelectionBox, SelectionSource } from '../lib/protocol.ts';
import { captureWithoutOverlay, includeCaptureReason, resolveCapture } from './capture-result.ts';
import { describeParts, type ElementFacts } from './collect.ts';
import type { Composer, ComposerInitial, Draft } from './composer.ts';
import type { CapturedElement } from './element-capture.ts';
import type { Highlight } from './highlight.ts';
import { toElementSelection } from './selection-shapes.ts';
import type { StatusTone } from './tray.ts';

/** The top page's side of picking inside same-origin iframes. */
export interface FrameCandidates {
  handle(frameId: number, event: FrameEvent): void;
  /** Tell every frame whether it should intercept clicks. */
  setPicking(picking: boolean): void;
  /** Hide every frame's highlight for the duration of a screenshot. */
  setCapturing(active: boolean): Promise<void>;
}

export interface FrameCandidatesDeps {
  layer: HTMLElement;
  composer: Composer;
  highlight: Highlight;
  isOpen(): boolean;
  isPicking(): boolean;
  setPicking(next: boolean): void;
  setStatus(text: string, tone: StatusTone): void;
  /** Bumped whenever a capture in flight should be abandoned. */
  captureGeneration(): number;
  pendingInitial(): ComposerInitial | undefined;
  onCaptured(captured: CapturedElement, draft: Draft): void;
}

/**
 * A frame's content script picks the element and reports facts; everything
 * that needs the tray or composer happens here, in the top document.
 *
 * The frame is found by its URL from this side, which only works for
 * same-origin frames — reading a cross-origin frame's location throws, and
 * that is exactly the case this cannot support.
 */
export function createFrameCandidates(deps: FrameCandidatesDeps): FrameCandidates {
  function handle(frameId: number, event: FrameEvent): void {
    if (!deps.isOpen()) return;

    switch (event.type) {
      case 'hello':
        if (deps.isPicking()) void command({ type: 'set-picking', picking: true }, frameId);
        return;
      case 'hover':
        // The pointer is inside the frame now, so this page's hover box is
        // stale. A pinned box belongs to an open composer and stays.
        if (!deps.composer.isOpen()) deps.highlight.hide();
        return;
      case 'key':
        onKey(event.key);
        return;
      case 'candidate':
        onCandidate(frameId, event.facts, event.frameUrl);
        return;
    }
  }

  function onKey(key: 'Escape' | 'toggle'): void {
    if (key === 'toggle') {
      deps.setPicking(!deps.isPicking());
    } else if (deps.composer.isOpen()) {
      deps.composer.close();
    } else if (deps.isPicking()) {
      deps.setPicking(false);
    }
  }

  function onCandidate(frameId: number, frameFacts: ElementFacts, frameUrl: string): void {
    if (!deps.isPicking()) return;

    // A click while the composer is up closes it, as it does on this page.
    if (deps.composer.isOpen()) {
      deps.composer.close();
      void command({ type: 'clear' }, frameId);
      return;
    }

    const located = locateFrame(frameUrl);
    if (!located.ok) {
      deps.setStatus(located.error, 'error');
      void command({ type: 'clear' }, frameId);
      return;
    }

    const box = offsetBox(frameFacts.box, located.value.element);
    const facts: ElementFacts = {
      ...frameFacts,
      box,
      selector: `${located.value.selector} >>> ${frameFacts.selector}`,
      frame: { selector: located.value.selector, url: frameUrl },
    };
    const parts = describeParts(facts);

    deps.composer.openAt(
      box,
      { tag: parts.tag, detail: [parts.detail, 'in frame'].filter((part) => part !== '').join(' · ') },
      (draft) => void add(frameId, facts, draft),
      () => void command({ type: 'clear' }, frameId),
      deps.pendingInitial(),
    );
  }

  async function add(frameId: number, facts: ElementFacts, draft: Draft): Promise<void> {
    const generation = deps.captureGeneration();
    deps.setStatus('Reading the component…', 'busy');

    const source = await readSource(frameId);
    await setCapturing(true);
    const capture = resolveCapture(await captureWithoutOverlay(deps.layer, facts.box));
    await setCapturing(false);
    void command({ type: 'clear' }, frameId);
    if (generation !== deps.captureGeneration()) return;

    const selection = toElementSelection(
      facts,
      draft,
      includeCaptureReason(draft.comment, capture),
      window.location.href,
      source,
      capture,
    );
    deps.onCaptured({ selection, capture, hasSource: source !== undefined }, draft);
  }

  async function readSource(frameId: number): Promise<SelectionSource | undefined> {
    const answer = await command({ type: 'read-source', marker: SOURCE_MARKER, frameId }, frameId);
    return answer.ok && answer.value !== true && answer.value !== null ? answer.value : undefined;
  }

  async function setCapturing(active: boolean): Promise<void> {
    if (document.querySelector('iframe') === null) return;
    await command({ type: 'capturing', active });
  }

  return {
    handle,
    setPicking(picking) {
      if (document.querySelector('iframe') === null) return;
      void command({ type: 'set-picking', picking });
    },
    setCapturing,
  };
}

function command(command: FrameCommand, frameId?: number) {
  return askBackground({ kind: 'frame-command', command, ...(frameId === undefined ? {} : { frameId }) });
}

interface LocatedFrame {
  element: HTMLIFrameElement;
  selector: string;
}

function locateFrame(frameUrl: string): Answer<LocatedFrame> {
  let sawCrossOrigin = false;

  for (const element of document.querySelectorAll('iframe')) {
    try {
      if (element.contentWindow?.location.href === frameUrl) {
        return ok({ element, selector: buildSelector(element) });
      }
    } catch {
      sawCrossOrigin = true;
    }
  }

  return fail(
    sawCrossOrigin
      ? 'Cross-origin frame, not supported.'
      : 'Could not find that frame from the top page.',
  );
}

/**
 * Move a box from the frame's viewport into this page's, clipped to the part
 * of the frame that is actually on screen so a screenshot never spills over
 * onto the surrounding page.
 */
function offsetBox(box: SelectionBox, frame: HTMLIFrameElement): SelectionBox {
  const rect = frame.getBoundingClientRect();
  const style = window.getComputedStyle(frame);
  const left = rect.left + edge(style.borderLeftWidth) + edge(style.paddingLeft);
  const top = rect.top + edge(style.borderTopWidth) + edge(style.paddingTop);
  const right = rect.right - edge(style.borderRightWidth) - edge(style.paddingRight);
  const bottom = rect.bottom - edge(style.borderBottomWidth) - edge(style.paddingBottom);

  const x = Math.max(left, left + box.x);
  const y = Math.max(top, top + box.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(right, left + box.x + box.width) - x),
    height: Math.max(0, Math.min(bottom, top + box.y + box.height) - y),
  };
}

function edge(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
