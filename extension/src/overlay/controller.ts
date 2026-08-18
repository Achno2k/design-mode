import { askBackground, isContextAlive } from '../lib/messaging.ts';
import type { DrawingSelection, Selection, SelectionBox, Target } from '../lib/protocol.ts';
import { captureElement, describeElement, describeForHuman, measure, readSource } from './collect.ts';
import { createComposer, type Draft } from './composer.ts';
import { createDrawing, type DrawingSnapshot } from './drawing.ts';
import { createHighlight } from './highlight.ts';
import { createTray } from './tray.ts';

/** The overlay as the content script sees it. */
export interface Controller {
  /** Open a review session: show the tray and start picking. */
  start(): Promise<void>;
  /** Close the session and discard anything not yet sent. */
  stop(): void;
  isOpen(): boolean;
  isPicking(): boolean;
  selectionCount(): number;
}

/**
 * Drive design mode.
 *
 * A *session* is open whenever the tray is up and holds completed review items.
 * Element picking and freehand drawing are mutually exclusive input modes. Both
 * can be left without ending the session, so the page can be used normally while
 * completed selections remain available to send.
 */
export function createController(layer: HTMLElement, host: Element): Controller {
  const highlight = createHighlight(layer);
  const composer = createComposer(layer);
  const selections: Selection[] = [];
  let open = false;
  let picking = false;
  let confirmedWorkingPaneId: string | null = null;
  let sending = false;
  let composingDrawing = false;
  let drawingGeneration = 0;

  const tray = createTray(layer, {
    onSend: send,
    onRefresh: () => {
      confirmedWorkingPaneId = null;
      void loadTargets('Refreshing targets…');
    },
    onTargetChange: () => {
      confirmedWorkingPaneId = null;
    },
    onClear: clearAll,
    onExit: stop,
    onToggleAnnotate: () => setPicking(!picking),
    onToggleDraw: toggleDrawing,
  });
  const drawing = createDrawing(layer, {
    onModeChange: (active) => tray.setDrawing(active),
    onCancelRequested: finishDrawing,
  });

  async function start(): Promise<void> {
    if (open) return;
    open = true;

    window.addEventListener('keydown', onKeyDown, true);
    tray.show();
    setPicking(true);
    await loadTargets();
  }

  function stop(): void {
    if (!open) return;

    setPicking(false);
    cancelDrawingDraft();
    window.removeEventListener('keydown', onKeyDown, true);

    open = false;
    selections.length = 0;
    confirmedWorkingPaneId = null;
    tray.setCount(0);
    tray.clearPageNote();
    tray.hide();
  }

  /**
   * Attach or detach the pointer listeners.
   *
   * Selections are deliberately untouched here — leaving picking is how the
   * user gets the page back, not how they abandon a review.
   */
  function setPicking(next: boolean): void {
    if (next) cancelDrawingDraft();
    if (picking === next) return;
    picking = next;

    for (const [type, handler] of pickingListeners) {
      if (next) window.addEventListener(type, handler as EventListener, true);
      else window.removeEventListener(type, handler as EventListener, true);
    }

    if (!next) {
      highlight.hide();
      composer.close();
    }
    tray.setAnnotating(next);
  }

  function toggleDrawing(): void {
    if (drawing.isActive()) {
      finishDrawing();
      return;
    }

    cancelDrawingDraft();
    setPicking(false);
    composer.close();
    highlight.hide();
    drawing.enter();
    tray.setStatus('Draw one or more strokes, then click the pen again.', 'idle');
  }

  function finishDrawing(): void {
    drawing.leave();
    const snapshot = drawing.snapshot();
    if (snapshot === null) {
      tray.setStatus('No drawing added.', 'idle');
      return;
    }

    composingDrawing = true;
    composer.openAt(
      snapshot.box,
      `Drawing · ${snapshot.strokes.length} stroke${snapshot.strokes.length === 1 ? '' : 's'}`,
      (draft) => void addDrawing(draft),
      abandonDrawing,
    );
  }

  function cancelDrawingDraft(): void {
    drawingGeneration += 1;
    const shouldClose = composingDrawing && composer.isOpen();
    composingDrawing = false;
    if (shouldClose) composer.close();
    drawing.leave();
    drawing.clear();
  }

  function abandonDrawing(): void {
    drawingGeneration += 1;
    composingDrawing = false;
    drawing.clear();
    tray.setStatus('Drawing canceled.', 'idle');
  }

  async function loadTargets(status = 'Finding the agent for this page…'): Promise<boolean> {
    // An orphaned overlay can neither resolve an agent nor send, so it releases
    // the page rather than sitting there swallowing every click.
    if (!isContextAlive()) {
      setPicking(false);
      tray.setTargets([], 'Reload the page — design mode was updated.');
      return false;
    }

    tray.setStatus(status, 'busy');
    tray.setRefreshing(true);

    try {
      const answer = await askBackground({ kind: 'get-targets', url: window.location.href });
      if (!answer.ok) {
        // The request may have started while this content-script context was
        // alive. If it died in flight, release every page-intercepting mode.
        if (!isContextAlive()) {
          setPicking(false);
          cancelDrawingDraft();
        }
        tray.setTargets([], answer.error);
        return false;
      }
      tray.setTargets(answer.value.candidates, answer.value.message);
      return true;
    } finally {
      tray.setRefreshing(false);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (composer.isOpen()) return;

    const element = pageElementAt(event);
    if (element === null) {
      highlight.hide();
      return;
    }
    highlight.show(element.getBoundingClientRect(), describeForHuman(describeElement(element)));
  }

  function onClick(event: MouseEvent): void {
    const element = pageElementAt(event);
    if (element === null) return;

    // The page must not act on this click — it was aimed at design mode.
    event.preventDefault();
    event.stopPropagation();

    if (composer.isOpen()) {
      composer.close();
      return;
    }

    highlight.hide();
    composer.open(element, describeForHuman(describeElement(element)), (draft) => {
      void addSelection(element, draft);
    });
  }

  /**
   * Escape steps back one level at a time: close the composer, then leave
   * picking, and never further. Closing the session is an explicit action, so a
   * stray keypress cannot discard a review.
   */
  function onKeyDown(event: KeyboardEvent): void {
    if (isAnnotateShortcut(event)) {
      event.preventDefault();
      setPicking(!picking);
      return;
    }

    if (event.key !== 'Escape') return;

    if (composer.isOpen()) {
      event.preventDefault();
      composer.close();
      return;
    }
    if (picking) {
      event.preventDefault();
      setPicking(false);
    }
  }

  async function addSelection(element: Element, draft: Draft): Promise<void> {
    tray.setStatus('Reading the component…', 'busy');

    const source = await readSource(element);
    // Re-measure in case the page moved while source information was loading.
    const shot = await captureWithoutChrome(measure(element));

    confirmedWorkingPaneId = null;
    selections.push({
      ...describeElement(element),
      comment: draft.comment,
      styleChanges: draft.styleChanges.length > 0 ? draft.styleChanges : undefined,
      source,
      screenshot: shot.ok && shot.value !== null ? shot.value : undefined,
    });
    tray.setCount(selections.length);

    if (!shot.ok) {
      tray.setStatus(`Added, but ${lowerFirst(shot.error)}`, 'busy');
      return;
    }
    tray.setStatus(describeAdded(draft, source !== undefined), 'idle');
  }

  async function addDrawing(draft: Draft): Promise<void> {
    const pending = drawing.snapshot();
    if (pending === null) {
      abandonDrawing();
      return;
    }

    const generation = drawingGeneration;
    composingDrawing = false;
    tray.setStatus('Capturing the drawing…', 'busy');
    const shot = await captureWithoutChrome(pending.box);
    // Clear, Exit, switching modes, or starting another drawing invalidates
    // this continuation. It must not commit old ink or clear newer ink.
    if (generation !== drawingGeneration) return;
    const committed = drawing.commit() ?? pending;

    confirmedWorkingPaneId = null;
    selections.push(toDrawingSelection(committed, draft.comment, shot.ok ? shot.value : null));
    tray.setCount(selections.length);

    if (!shot.ok) {
      tray.setStatus(`Added drawing, but ${lowerFirst(shot.error)}`, 'busy');
      return;
    }
    tray.setStatus('Drawing added.', 'idle');
  }

  async function captureWithoutChrome(box: SelectionBox) {
    layer.classList.add('layer--capturing');
    try {
      return await captureElement(box);
    } finally {
      layer.classList.remove('layer--capturing');
    }
  }

  function clearAll(): void {
    cancelDrawingDraft();
    selections.length = 0;
    confirmedWorkingPaneId = null;
    tray.setCount(0);
    tray.clearPageNote();
    tray.setStatus('', 'idle');
  }

  async function send(): Promise<void> {
    const initialPageNote = tray.pageNote();
    if (sending || !hasSendableContent(initialPageNote)) return;

    const requestedPaneId = tray.selectedPaneId();
    if (requestedPaneId === null) return;

    sending = true;
    try {
      const refreshed = await loadTargets('Refreshing targets before send…');
      if (!refreshed) return;

      const target = tray.selectedTarget();
      if (target === null || target.paneId !== requestedPaneId) {
        confirmedWorkingPaneId = null;
        tray.setStatus('That target is no longer available — choose another.', 'error');
        return;
      }
      if (!confirmTargetReady(target)) return;

      const pageNote = tray.pageNote();
      if (!hasSendableContent(pageNote)) {
        tray.setStatus('Nothing to send.', 'idle');
        return;
      }
      tray.setStatus(target.status === 'unknown' ? 'Status unknown — sending anyway…' : 'Sending…', 'busy');

      const answer = await askBackground({
        kind: 'send',
        request: {
          url: window.location.href,
          paneId: target.paneId,
          ...(pageNote === '' ? {} : { pageNote }),
          selections,
        },
      });

      if (!answer.ok) {
        tray.setStatus(answer.error, 'error');
        return;
      }

      clearAll();
      tray.setStatus(`Sent to ${answer.value.paneId}.`, 'success');
    } finally {
      sending = false;
    }
  }

  function hasSendableContent(pageNote: string): boolean {
    return selections.length > 0 || pageNote !== '';
  }

  function confirmTargetReady(target: Target): boolean {
    if (target.status === 'blocked') {
      confirmedWorkingPaneId = null;
      tray.setStatus('Cannot send: that target is blocked.', 'error');
      return false;
    }

    if (target.status === 'working' && confirmedWorkingPaneId !== target.paneId) {
      confirmedWorkingPaneId = target.paneId;
      tray.setStatus('Agent is busy · Send again to queue', 'busy');
      return false;
    }

    if (target.status !== 'working') confirmedWorkingPaneId = null;
    return true;
  }

  /** Tell the user what was captured, since live edits are easy to miss. */
  function describeAdded(draft: Draft, hasSource: boolean): string {
    const edits = draft.styleChanges.length;
    const parts = [edits === 0 ? 'Added' : `Added with ${edits} live edit${edits === 1 ? '' : 's'}`];
    if (!hasSource) parts.push('no source location in this build');
    return `${parts.join(' — ')}.`;
  }

  function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  /**
   * The element under the pointer, ignoring the overlay itself.
   *
   * Events that originate inside the shadow root are the user operating the
   * tray or composer, not picking something on the page.
   */
  function pageElementAt(event: MouseEvent): Element | null {
    if (event.composedPath().includes(host)) return null;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element === null || element === host || element === document.documentElement
      ? null
      : element;
  }

  const pickingListeners: [keyof WindowEventMap, (event: never) => void][] = [
    ['pointermove', onPointerMove],
    ['click', onClick],
  ];

  return {
    start,
    stop,
    isOpen: () => open,
    isPicking: () => picking,
    selectionCount: () => selections.length,
  };
}

/** Command-period on macOS, control-period elsewhere. */
function isAnnotateShortcut(event: KeyboardEvent): boolean {
  return event.key === '.' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

function toDrawingSelection(
  snapshot: DrawingSnapshot,
  comment: string,
  screenshot: string | null,
): DrawingSelection {
  const { box } = snapshot;
  return {
    kind: 'drawing',
    comment,
    box: { ...box },
    strokes: snapshot.strokes.map((stroke) => ({
      color: stroke.color,
      width: stroke.width,
      points: stroke.points.map((point) => ({
        x: round(point.x - box.x),
        y: round(point.y - box.y),
        pressure: point.pressure,
      })),
    })),
    ...(screenshot === null ? {} : { screenshot }),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
