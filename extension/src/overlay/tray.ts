import {
  clearPanelPosition,
  clearTrayCollapse,
  readPanelPosition,
  readTrayCollapse,
  writePanelPosition,
  writeTrayCollapse,
  type TraySide,
} from '../lib/panel-position.ts';
import type { ItemTriage, SelectionBox, Target } from '../lib/protocol.ts';
import { createAgentPicker } from './agent-picker.ts';
import { createAnnotationStack, type AnnotationItem } from './annotations.ts';
import { fill, keepScrollInside, make } from './dom.ts';
import { iconButton, isMac, stopKeyboardLeak } from './tray-parts.ts';
import { makeDraggable } from './draggable.ts';
import { ANNOTATE_ICON, ARROW_UP_RIGHT_ICON, CHEVRON_ICON, CONSOLE_ICON, PEN_ICON } from './icons.ts';
import { growBarFrom, shrinkBarInto, slideTabIn, slideTabOut } from './tray-collapse.ts';
import { createPickRow, type PickStatusView } from './tray-pick-row.ts';
import { createEdgeTab } from './tray-tab.ts';

/** Tone of the tray's status line. */
export type StatusTone = 'idle' | 'busy' | 'error' | 'success';

/** The annotation toolbar: which agent, what is queued, and Send. */
export interface Tray {
  setTargets(targets: Target[], message?: string): void;
  /** Replace the queued annotations shown in the card above the bar. */
  setSelections(items: AnnotationItem[]): void;
  /**
   * Say something above the bar for a moment. Errors stay longer than good
   * news, busy lines stay until replaced, and idle remarks are not shown at
   * all — the controls explain themselves. `sticky` keeps a line up.
   */
  setStatus(text: string, tone: StatusTone, options?: { sticky?: boolean }): void;
  setRefreshing(refreshing: boolean): void;
  /** Reflect whether element picking is currently on. */
  setAnnotating(active: boolean): void;
  /** Reflect whether freehand drawing is currently on. */
  setDrawing(active: boolean): void;
  /** Follow the review that was last sent, or hide the row with `null`. */
  setPickStatus(view: PickStatusView | null): void;
  /** Reflect whether console errors are being collected, and how many so far. */
  setConsoleCapture(on: boolean, count: number): void;
  /** Where the bar is on screen, for panels that must not cover it; `null` when it is away. */
  footprint(): DOMRect | null;
  /** Where the sent-review row is, for a panel that should open beside it. */
  pickRowBox(): SelectionBox;
  selectedPaneId(): string | null;
  selectedTarget(): Target | null;
  pageNote(): string;
  setPageNote(value: string): void;
  clearPageNote(): void;
  /** Send the bar back to its docked place and forget where it was dragged. */
  dock(): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface TrayHandlers {
  onSend(): void;
  onRefresh(): void;
  onTargetChange(): void;
  onPageNoteChange(value: string): void;
  onClear(): void;
  onRemoveSelection(index: number): void;
  onEditSelection(index: number): void;
  onReselect(index: number): void;
  onSetTriage(index: number, triage: ItemTriage): void;
  onToggleAnnotate(): void;
  onToggleDraw(): void;
  onToggleConsole(): void;
  onReloadAndShow(): void;
  onReply(): void;
}

/** Matches the binding handled in the controller. */
const SHORTCUT = isMac() ? '⌘.' : 'Ctrl+.';

/** How long a toast stays: long enough to read an error, not long enough to nag. */
const TOAST_MS: Record<StatusTone, number> = { idle: 0, success: 3000, error: 6000, busy: 0 };

/**
 * One flat bar: a note on top, and underneath it the two picking modes, the
 * agent, the console switch, what is queued, and Send.
 *
 * The daemon's first candidate is only a guess, so it is pre-selected but never
 * sent automatically — the whole point of naming the agent is that a wrong
 * guess is obvious before anything is delivered.
 *
 * The bar starts docked above the bottom edge and can be dragged anywhere by
 * its own padding, because what is worth annotating is sometimes exactly what
 * the bar is covering.
 */
export function createTray(layer: HTMLElement, handlers: TrayHandlers): Tray {
  const picker = createAgentPicker({
    onChange: () => {
      handlers.onTargetChange();
      showStatusForSelection();
      updateSendDisabled();
    },
    onRefresh: () => handlers.onRefresh(),
  });

  const stack = createAnnotationStack({
    onRemove: (index) => handlers.onRemoveSelection(index),
    onEdit: (index) => handlers.onEditSelection(index),
    onReselect: (index) => handlers.onReselect(index),
    onSetTriage: (index, triage) => handlers.onSetTriage(index, triage),
    onClear: () => handlers.onClear(),
  });
  const pickRow = createPickRow({
    onReloadAndShow: () => handlers.onReloadAndShow(),
    onReply: () => handlers.onReply(),
  });

  const collapse = iconButton(
    'circle circle--sm tray__collapse',
    CHEVRON_ICON,
    'Collapse',
    'Collapse the toolbar',
  );

  const note = make('textarea', {
    className: 'tray__note',
    attributes: { rows: '1', placeholder: 'Optional notes', 'aria-label': 'Page note' },
  });

  const toast = make('div', {
    className: 'toast',
    attributes: { role: 'status', 'aria-live': 'polite' },
  });

  // The two picking modes are one switch: a knob slides to the tool in hand
  // and the track takes that tool's colour. Neither on, and the knob rests
  // unlit where it last was.
  const annotate = iconButton('switch__side tray__annotate', ANNOTATE_ICON, 'Annotate');
  const tip = make('span', { className: 'tip' });
  const annotateSlot = fill(make('div', { className: 'tip-anchor' }), tip, annotate);

  const pen = iconButton('switch__side tray__draw', PEN_ICON, 'Draw on page');
  const penTip = make('span', { className: 'tip', text: 'Draw on page' });
  const penSlot = fill(make('div', { className: 'tip-anchor' }), penTip, pen);

  const knob = make('span', { className: 'switch__knob' });
  const modes = fill(
    make('div', { className: 'switch switch--off', attributes: { role: 'group', 'aria-label': 'Picking mode' } }),
    knob,
    annotateSlot,
    penSlot,
  );

  const consoleButton = iconButton('circle', CONSOLE_ICON, 'Capture console errors');
  const consoleTip = make('span', { className: 'tip', text: 'Capture console errors' });
  const consoleSlot = fill(make('div', { className: 'tip-anchor' }), consoleTip, consoleButton);

  const queue = make('button', {
    className: 'pill tray__queue',
    text: '0 annotations',
    attributes: { type: 'button', hidden: '', 'aria-expanded': 'false', title: 'Show what will be sent' },
  });

  const send = iconButton('circle circle--accent tray__send', ARROW_UP_RIGHT_ICON, 'Send');
  const sendSlot = fill(
    make('div', { className: 'tip-anchor' }),
    make('span', { className: 'tip', text: 'Send' }),
    send,
  );

  const row = fill(
    make('div', { className: 'tray__row' }),
    modes,
    picker.element(),
    consoleSlot,
    fill(make('div', { className: 'tray__end' }), queue, sendSlot),
  );

  // The collapse button rides on the note's own line rather than floating over
  // the top of the bar, so it stays put when the sent-review row appears above.
  const noteRow = fill(make('div', { className: 'tray__note-row' }), note, collapse);

  const panel = fill(
    make('div', { className: 'panel tray', attributes: { hidden: '' } }),
    stack.element(),
    toast,
    pickRow.element,
    noteRow,
    row,
  );
  keepScrollInside(panel);
  layer.append(panel);

  // Collapsed, the bar leaves the page entirely and only the edge tab stays
  // behind, so getting out of the way never means losing the way back.
  const tab = createEdgeTab(layer, expand);

  const drag = makeDraggable(panel, panel, {
    floatingClass: 'tray--floating',
    draggingClass: 'tray--dragging',
    onSettle: (position) => {
      writePanelPosition(position);
      placeStack();
    },
  });

  // Restoring is best-effort and asynchronous, so the bar appears docked and
  // moves to where it was left once storage answers. A session that starts in
  // the meantime docks the bar, and its answer must not undo that.
  let docked = false;
  void readPanelPosition().then((position) => {
    if (position !== null && !docked) drag.moveTo(position);
    placeStack();
  });
  void readTrayCollapse().then((side) => {
    if (side !== null && !docked) applyCollapse(side);
  });

  let selectionCount = 0;
  let knobSide = 'switch--left';
  let annotating = false;
  let drawing = false;
  let visible = false;
  let collapsedSide: TraySide | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** A collapse or expand in flight; a second press waits for it. */
  let swapping = false;

  collapse.addEventListener('click', collapseToEdge);
  annotate.addEventListener('click', () => handlers.onToggleAnnotate());
  pen.addEventListener('click', () => handlers.onToggleDraw());
  consoleButton.addEventListener('click', () => handlers.onToggleConsole());
  send.addEventListener('click', () => handlers.onSend());
  note.addEventListener('input', () => {
    growNote();
    updateSendDisabled();
    handlers.onPageNoteChange(note.value.trim());
  });

  queue.addEventListener('click', () => {
    placeStack();
    stack.toggle();
    queue.setAttribute('aria-expanded', String(stack.isOpen()));
    queue.classList.toggle('tray__queue--on', stack.isOpen());
  });

  note.addEventListener('keydown', (event) => {
    // Keep every tray keystroke out of the host page.
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.key !== 'Enter') return;
    if (event.shiftKey) return;

    event.preventDefault();
    if (hasSendableContent() && isAllowedTarget(picker.selected())) handlers.onSend();
  });
  note.addEventListener('keypress', stopKeyboardLeak);
  note.addEventListener('keyup', stopKeyboardLeak);

  /** The note grows with its lines instead of scrolling, up to its own cap. */
  function growNote(): void {
    note.style.height = 'auto';
    note.style.height = `${note.scrollHeight}px`;
  }

  /** The card and the toast sit above the bar unless it has been parked too high. */
  function placeStack(): void {
    const room = panel.getBoundingClientRect().top;
    stack.element().classList.toggle('stack--below', room < 240);
    toast.classList.toggle('toast--below', room < 80);
  }

  /**
   * Swap the bar for its edge tab.
   *
   * The tab goes to whichever edge the bar is already nearer, so collapsing
   * never throws it across the window past what the user was looking at. The
   * choice is stored, because a bar put away has to stay away until it is asked
   * back — including across the navigations that rebuild the whole overlay.
   */
  function collapseToEdge(): void {
    if (swapping) return;
    const rect = panel.getBoundingClientRect();
    const side: TraySide = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    writeTrayCollapse(side);
    void swap(async () => {
      picker.close();
      closeQueue();
      await shrinkBarInto(panel, side);
      applyCollapse(side);
      await slideTabIn(tab.element, side);
    });
  }

  function expand(): void {
    if (swapping || collapsedSide === null) return;
    const side = collapsedSide;
    clearTrayCollapse();
    void swap(async () => {
      await slideTabOut(tab.element, side);
      applyCollapse(null);
      placeStack();
      await growBarFrom(panel, side);
    });
  }

  async function swap(sequence: () => Promise<void>): Promise<void> {
    swapping = true;
    try {
      await sequence();
    } finally {
      swapping = false;
    }
  }

  function applyCollapse(side: TraySide | null): void {
    collapsedSide = side;

    if (side !== null) {
      picker.close();
      closeQueue();
    }

    if (side !== null) tab.setSide(side);
    render();
  }

  /** Only one of the bar and its tab is ever on screen, and only in a session. */
  function render(): void {
    panel.hidden = !visible || collapsedSide !== null;
    tab.setVisible(visible && collapsedSide !== null);
  }

  function closeQueue(): void {
    stack.close();
    queue.setAttribute('aria-expanded', 'false');
    queue.classList.remove('tray__queue--on');
  }

  /**
   * Only a blocked agent is worth a word at rest, because Send is disabled and
   * the user needs to know why. A working agent is told about on the first
   * press of Send, where the confirmation actually happens; the menu's dot
   * and status word cover the rest.
   */
  function showStatusForSelection(): void {
    const target = picker.selected();
    if (target?.status === 'blocked') setStatus('That agent is blocked · choose another', 'error');
    else setStatus('', 'idle');
  }

  function setStatus(text: string, tone: StatusTone, options: { sticky?: boolean } = {}): void {
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = null;

    // Idle remarks ("Added.", "Drawing canceled.") are noise next to controls
    // that already show their state, so they are dropped rather than shown.
    const shown = text !== '' && tone !== 'idle';
    toast.textContent = shown ? text : toast.textContent;
    toast.className = `toast toast--${tone}${shown ? ' toast--open' : ''}${toast.classList.contains('toast--below') ? ' toast--below' : ''}`;
    if (!shown) return;

    placeStack();
    const linger = options.sticky === true ? 0 : TOAST_MS[tone];
    if (linger > 0) toastTimer = setTimeout(() => setStatus('', 'idle'), linger);
  }

  function updateSendDisabled(): void {
    send.disabled = !hasSendableContent() || !isAllowedTarget(picker.selected());
  }

  function hasSendableContent(): boolean {
    return selectionCount > 0 || note.value.trim() !== '';
  }

  /** Slide the knob to the active mode, or let it rest unlit where it last was. */
  function updateMode(): void {
    const mode = drawing ? 'draw' : annotating ? 'annotate' : 'off';
    modes.className = `switch switch--${mode}`;
    tab.setMode(mode);
    if (mode !== 'off') modes.classList.add(mode === 'draw' ? 'switch--right' : 'switch--left');
    else modes.classList.add(knobSide);
    if (mode !== 'off') knobSide = mode === 'draw' ? 'switch--right' : 'switch--left';
    annotate.setAttribute('aria-pressed', String(annotating));
    pen.setAttribute('aria-pressed', String(drawing));
    tip.textContent = annotating ? `Stop annotating  ${SHORTCUT}` : `Annotate  ${SHORTCUT}`;
    penTip.textContent = drawing ? 'Finish drawing' : 'Draw on page';
  }

  return {
    setTargets(next, message) {
      picker.setTargets(next);

      if (next.length === 0) {
        setStatus(message ?? 'No agent found for this page.', 'error');
        updateSendDisabled();
        return;
      }

      showStatusForSelection();
      updateSendDisabled();
    },

    setSelections(items) {
      selectionCount = items.length;
      stack.set(items);
      queue.hidden = items.length === 0;
      queue.textContent = `${items.length} annotation${items.length === 1 ? '' : 's'}`;
      tab.setCount(items.length);
      if (items.length === 0) closeQueue();
      updateSendDisabled();
    },

    setStatus,

    setRefreshing(refreshing) {
      picker.setRefreshing(refreshing);
    },

    setAnnotating(active) {
      annotating = active;
      updateMode();
    },

    setDrawing(active) {
      drawing = active;
      updateMode();
    },

    setPickStatus(view) {
      pickRow.set(view);
    },

    setConsoleCapture(on, count) {
      consoleButton.classList.toggle('circle--on', on);
      consoleButton.setAttribute('aria-pressed', String(on));
      consoleTip.textContent = on ? `Console errors on · ${count} so far` : 'Capture console errors';
    },

    footprint: () => (!visible || collapsedSide !== null ? null : panel.getBoundingClientRect()),

    pickRowBox() {
      const rect = pickRow.element.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    },

    selectedPaneId: () => picker.selected()?.paneId ?? null,
    selectedTarget: () => picker.selected(),
    pageNote: () => note.value.trim(),
    setPageNote(value) {
      note.value = value;
      growNote();
      updateSendDisabled();
    },
    clearPageNote() {
      note.value = '';
      growNote();
      updateSendDisabled();
    },
    dock() {
      docked = true;
      applyCollapse(null);
      clearTrayCollapse();
      drag.clear();
      clearPanelPosition();
      placeStack();
    },
    show: () => {
      visible = true;
      render();
      growNote();
      placeStack();
    },
    hide: () => {
      picker.close();
      closeQueue();
      visible = false;
      render();
    },
    destroy: () => {
      picker.close();
      closeQueue();
      visible = false;
      render();
      drag.destroy();
    },
  };
}

function isAllowedTarget(target: Target | null): boolean {
  return target !== null && target.status !== 'blocked';
}
