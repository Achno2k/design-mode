import { askBackground, isContextAlive, type ReviewSession, type SentPick } from '../lib/messaging.ts';
import type { Selection } from '../lib/protocol.ts';
import { captureNotice, captureWithoutOverlay, includeCaptureReason, resolveCapture } from './capture-result.ts';
import { describeElement, describeParts } from './collect.ts';
import { createComposer, type Draft } from './composer.ts';
import { describeAdded, lowerFirst } from './controller-input.ts';
import { createKeyHandler } from './controller-keys.ts';
import { createDrawing } from './drawing.ts';
import { captureElementSelection } from './element-capture.ts';
import { createHighlight } from './highlight.ts';
import { createPickInput } from './pick-input.ts';
import { createReviewSessionState } from './review-session.ts';
import { createRouteWatcher } from './route-watcher.ts';
import { createSelectionOps } from './selection-ops.ts';
import { toDrawingSelection } from './selection-shapes.ts';
import { createSendFlow } from './send-flow.ts';
import { createStyleEffects } from './style-effects.ts';
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
  /** Tear down listeners without discarding the persisted review. */
  destroy(): void;
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
 *
 * The pieces are wired here and live elsewhere: `pick-input` for the pointer,
 * `controller-keys` for the keyboard, `selection-ops` for the queued list, and
 * `send-flow` for delivery.
 */
export function createController(layer: HTMLElement, host: Element): Controller {
  const highlight = createHighlight(layer, host);
  // Reads the toolbar's footprint lazily: it can be dragged, so where it is
  // now says nothing about where it will be when a composer next opens.
  const composer = createComposer(layer, { reservedBottom: () => tray.reservedBottom() });
  const selections: Selection[] = [];
  const styleEffects = createStyleEffects();
  let open = false;
  let picking = false;
  let composingDrawing = false;
  let drawingGeneration = 0;
  let captureGeneration = 0;
  let targetRequestGeneration = 0;

  const tray = createTray(layer, {
    onSend: () => void sendFlow.send(),
    onRefresh: () => {
      sendFlow.invalidate();
      void loadTargets('Refreshing targets…');
    },
    onTargetChange: () => sendFlow.invalidate(),
    onPageNoteChange: (note) => reviewSession.setPageNote(window.location.href, note, picking),
    onClear: clearAll,
    onRemoveSelection: (index) => selectionOps.remove(index),
    onEditSelection: (index) => selectionOps.edit(index),
    onReselect: (index) => selectionOps.reselect(index),
    onMoveSelection: (index, direction) => selectionOps.move(index, direction),
    onSetTriage: (index, triage) => selectionOps.setTriage(index, triage),
    onToggleAnnotate: () => setPicking(!picking),
    onToggleDraw: toggleDrawing,
    onToggleConsole: notYet,
    onReloadAndShow: notYet,
    onReply: notYet,
  });
  const reviewSession = createReviewSessionState(selections, () => window.location.href, (message) =>
    tray.setStatus(message, 'error'),
  );
  const selectionOps = createSelectionOps({
    selections,
    styleEffects,
    reviewSession,
    tray,
    composer,
    isPicking: () => picking,
    setPicking,
    onChanged: () => sendFlow.invalidate(),
  });
  const sendFlow = createSendFlow({
    tray,
    reviewSession,
    selections,
    currentUrl: () => window.location.href,
    loadTargets,
    onSent,
  });
  const drawing = createDrawing(layer, {
    onModeChange: (active) => tray.setDrawing(active),
    onCancelRequested: finishDrawing,
  });
  const pickInput = createPickInput({ host, highlight, composer, onPick: openComposerFor });
  const onKeyDown = createKeyHandler({ composer, isPicking: () => picking, setPicking });
  const targetWatcher = createTargetWatcher(() => window.location.href, (targets, message) =>
    tray.setTargets(targets, message),
  );
  const routeWatcher = createRouteWatcher((url) => tray.setPageNote(reviewSession.pageNote(url)));

  async function start(): Promise<void> {
    if (open) return;
    // A new session starts docked; where the bar was dragged belonged to the last one.
    tray.dock();
    openSession(true);
    reviewSession.save(picking);
    await loadTargets();
    if (open) targetWatcher.start();
  }

  async function resume(stored: ReviewSession): Promise<void> {
    if (open) return;
    tray.setPageNote(reviewSession.restore(stored));
    selectionOps.show();
    showLastPick();
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

    releasePage();
    open = false;
    reviewSession.end();
    styleEffects.clear();
    selections.length = 0;
    sendFlow.invalidate();
    selectionOps.show();
    tray.clearPageNote();
    tray.setPickStatus(null);
    tray.hide();
  }

  function destroy(): void {
    releasePage();
    styleEffects.clear();
    open = false;
    drawing.destroy();
    tray.destroy();
  }

  /** Hand the page back: stop intercepting it and abandon work in flight. */
  function releasePage(): void {
    captureGeneration += 1;
    setPicking(false);
    cancelDrawingDraft();
    targetWatcher.stop();
    routeWatcher.stop();
    window.removeEventListener('keydown', onKeyDown, true);
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

    if (next) pickInput.attach();
    else pickInput.detach();

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

    const generation = ++targetRequestGeneration;
    tray.setStatus(status, 'busy');
    tray.setRefreshing(true);

    try {
      const answer = await askBackground({ kind: 'get-targets', url: window.location.href });
      if (generation !== targetRequestGeneration) return false;
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
      if (generation === targetRequestGeneration) tray.setRefreshing(false);
    }
  }

  function openComposerFor(element: Element): void {
    const parts = describeParts(describeElement(element));
    composer.open(
      element,
      parts,
      (draft) => void addSelection(element, draft),
      () => highlight.hide(),
      selectionOps.pendingInitial(),
    );
  }

  async function addSelection(element: Element, draft: Draft): Promise<void> {
    highlight.hide();
    const generation = captureGeneration;
    tray.setStatus('Reading the component…', 'busy');

    const captured = await captureElementSelection(layer, element, draft, window.location.href);
    if (generation !== captureGeneration) {
      draft.styleEffect?.revert();
      return;
    }

    selectionOps.add(captured.selection, draft.styleEffect);

    const notice = captureNotice(captured.capture);
    tray.setStatus(
      notice === undefined ? describeAdded(draft, captured.hasSource) : `Added, but ${lowerFirst(notice)}`,
      notice === undefined ? 'idle' : 'busy',
    );
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
    const capture = resolveCapture(await captureWithoutOverlay(layer, pending.box));
    // Clear, Exit, switching modes, or starting another drawing invalidates
    // this continuation. It must not commit old ink or clear newer ink.
    if (generation !== drawingGeneration) return;
    const committed = drawing.commit() ?? pending;

    selectionOps.add({
      ...toDrawingSelection(committed, includeCaptureReason(draft.comment, capture), capture, draft.triage),
      pageUrl: window.location.href,
    });

    const notice = captureNotice(capture);
    tray.setStatus(
      notice === undefined ? 'Drawing added.' : `Added drawing, but ${lowerFirst(notice)}`,
      notice === undefined ? 'idle' : 'busy',
    );
  }

  function clearAll(): void {
    captureGeneration += 1;
    cancelDrawingDraft();
    selectionOps.clear();
    tray.clearPageNote();
    tray.setStatus('', 'idle');
  }

  function onSent(pick: SentPick): void {
    clearAll();
    reviewSession.setLastPick(pick, picking);
    showLastPick();
    tray.setStatus(`Sent to ${pick.paneId}.`, 'success');
    void targetWatcher.refresh();
  }

  function showLastPick(): void {
    const pick = reviewSession.lastPick();
    tray.setPickStatus(
      pick === null ? null : { paneId: pick.paneId, status: pick.status, followUps: pick.followUps },
    );
  }

  function notYet(): void {
    tray.setStatus('Not available yet.', 'idle');
  }

  return {
    start,
    resume,
    stop,
    destroy,
    isOpen: () => open,
    isPicking: () => picking,
    selectionCount: () => selections.length,
  };
}
