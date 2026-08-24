import { askBackground, isContextAlive, type ReviewSession } from '../lib/messaging.ts';
import type { Selection, SelectionBox, Target } from '../lib/protocol.ts';
import {
  captureElement,
  describeElement,
  describeForHuman,
  describeParts,
  measure,
  readSource,
} from './collect.ts';
import { createComposer, type Draft } from './composer.ts';
import { createDrawing } from './drawing.ts';
import { createHighlight } from './highlight.ts';
import { createReviewSessionState, type ReviewSessionState } from './review-session.ts';
import { createRouteWatcher } from './route-watcher.ts';
import { toAnnotationItem, toDrawingSelection } from './selection-shapes.ts';
import { createTargetWatcher } from './target-watcher.ts';
import { createTray } from './tray.ts';

/** The overlay as the content script sees it. */
export interface Controller {
  /** Open a review session: show the tray and start picking. */
  start(): Promise<void>;
  /** Restore a session after this tab navigated to another page. */
  resume(session: ReviewSession): Promise<void>;
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
  // Reads the toolbar's footprint lazily: it can be dragged, so where it is
  // now says nothing about where it will be when a composer next opens.
  const composer = createComposer(layer, { reservedBottom: () => tray.reservedBottom() });
  const selections: Selection[] = [];
  let open = false;
  let picking = false;
  let confirmedWorkingPaneId: string | null = null;
  let sending = false;
  let composingDrawing = false;
  let drawingGeneration = 0;

  let reviewSession: ReviewSessionState;
  const tray = createTray(layer, {
    onSend: send,
    onRefresh: () => {
      confirmedWorkingPaneId = null;
      void loadTargets('Refreshing targets…');
    },
    onTargetChange: () => {
      confirmedWorkingPaneId = null;
    },
    onPageNoteChange: (note) => reviewSession.setPageNote(window.location.href, note, picking),
    onClear: clearAll,
    onRemoveSelection: removeSelection,
    onToggleAnnotate: () => setPicking(!picking),
    onToggleDraw: toggleDrawing,
  });
  reviewSession = createReviewSessionState(selections, () => window.location.href, (message) =>
    tray.setStatus(message, 'error'),
  );
  const drawing = createDrawing(layer, {
    onModeChange: (active) => tray.setDrawing(active),
    onCancelRequested: finishDrawing,
  });
  const targetWatcher = createTargetWatcher(
    () => window.location.href,
    (targets, message) => tray.setTargets(targets, message),
  );
  const routeWatcher = createRouteWatcher((url) => tray.setPageNote(reviewSession.pageNote(url)));

  async function start(): Promise<void> {
    if (open) return;
    openSession(true);
    reviewSession.save(picking);
    await loadTargets();
    if (open) targetWatcher.start();
  }

  async function resume(stored: ReviewSession): Promise<void> {
    if (open) return;
    tray.setPageNote(reviewSession.restore(stored));
    showSelections();
    openSession(stored.picking);
    await loadTargets();
    if (open) targetWatcher.start();
  }

  function openSession(shouldPick: boolean): void {
    open = true;
    window.addEventListener('keydown', onKeyDown, true);
    routeWatcher.start();
    tray.show();
    setPicking(shouldPick);
  }

  function stop(): void {
    if (!open) return;

    setPicking(false);
    cancelDrawingDraft();
    targetWatcher.stop();
    routeWatcher.stop();
    window.removeEventListener('keydown', onKeyDown, true);

    open = false;
    reviewSession.end();
    selections.length = 0;
    confirmedWorkingPaneId = null;
    showSelections();
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
    if (open) reviewSession.save(picking);
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
      {
        tag: 'Drawing',
        detail: `${snapshot.strokes.length} stroke${snapshot.strokes.length === 1 ? '' : 's'}`,
      },
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
      targetWatcher.record(answer.value.candidates, answer.value.message);
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
    composer.open(element, describeParts(describeElement(element)), (draft) => {
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
      pageUrl: window.location.href,
      styleChanges: draft.styleChanges.length > 0 ? draft.styleChanges : undefined,
      source,
      screenshot: shot.ok && shot.value !== null ? shot.value : undefined,
    });
    showSelections();
    reviewSession.save(picking);

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
    selections.push({
      ...toDrawingSelection(committed, draft.comment, shot.ok ? shot.value : null),
      pageUrl: window.location.href,
    });
    showSelections();
    reviewSession.save(picking);

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
    reviewSession.clearContent(picking);
    confirmedWorkingPaneId = null;
    showSelections();
    tray.clearPageNote();
    tray.setStatus('', 'idle');
  }

  /** Drop one annotation from the review without touching the rest. */
  function removeSelection(index: number): void {
    if (index < 0 || index >= selections.length) return;

    selections.splice(index, 1);
    confirmedWorkingPaneId = null;
    showSelections();
    reviewSession.save(picking);
    tray.setStatus(selections.length === 0 ? '' : 'Annotation removed.', 'idle');
  }

  function showSelections(): void {
    tray.setSelections(selections.map(toAnnotationItem));
  }

  async function send(): Promise<void> {
    if (sending || !hasSendableContent()) return;

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

      if (!hasSendableContent()) {
        tray.setStatus('Nothing to send.', 'idle');
        return;
      }
      tray.setStatus(target.status === 'unknown' ? 'Status unknown — sending anyway…' : 'Sending…', 'busy');

      const answer = await askBackground({
        kind: 'send',
        request: {
          url: window.location.href,
          paneId: target.paneId,
          pageNotes: reviewSession.pageNotes(),
          selections,
        },
      });

      if (!answer.ok) {
        tray.setStatus(answer.error, 'error');
        return;
      }

      clearAll();
      tray.setStatus(`Sent to ${answer.value.paneId}.`, 'success');
      void targetWatcher.refresh();
    } finally {
      sending = false;
    }
  }

  function hasSendableContent(): boolean {
    return selections.length > 0 || reviewSession.pageNotes().length > 0;
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
    resume,
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
