import {
  clearPanelPosition,
  readPanelPosition,
  writePanelPosition,
} from '../lib/panel-position.ts';
import type { ItemTriage, Target } from '../lib/protocol.ts';
import { createAgentPicker } from './agent-picker.ts';
import { createAnnotationStack, type AnnotationItem } from './annotations.ts';
import { fill, make } from './dom.ts';
import { makeDraggable } from './draggable.ts';
import {
  ANNOTATE_ICON,
  ARROW_UP_ICON,
  CHEVRON_ICON,
  CONSOLE_ICON,
  PEN_ICON,
  REFRESH_ICON,
} from './icons.ts';
import { createPickRow, type PickStatusView } from './tray-pick-row.ts';

/** Tone of the tray's status line. */
export type StatusTone = 'idle' | 'busy' | 'error' | 'success';

/** The annotation toolbar: which agent, what is queued, and Send. */
export interface Tray {
  setTargets(targets: Target[], message?: string): void;
  /** Replace the queued annotations shown in the card above the bar. */
  setSelections(items: AnnotationItem[]): void;
  setStatus(text: string, tone: StatusTone): void;
  setRefreshing(refreshing: boolean): void;
  /** Reflect whether element picking is currently on. */
  setAnnotating(active: boolean): void;
  /** Reflect whether freehand drawing is currently on. */
  setDrawing(active: boolean): void;
  /** Follow the review that was last sent, or hide the row with `null`. */
  setPickStatus(view: PickStatusView | null): void;
  /** Reflect whether console errors are being collected, and how many so far. */
  setConsoleCapture(on: boolean, count: number): void;
  /** Screen space along the bottom that other panels should keep clear of. */
  reservedBottom(): number;
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
  onMoveSelection(index: number, direction: -1 | 1): void;
  onSetTriage(index: number, triage: ItemTriage): void;
  onToggleAnnotate(): void;
  onToggleDraw(): void;
  onToggleConsole(): void;
  onReloadAndShow(): void;
  onReply(): void;
}

/**
 * Show the resolved agent and let the user override it.
 *
 * The daemon's first candidate is only a guess, so it is pre-selected but never
 * sent automatically — the whole point of naming the agent is that a wrong
 * guess is obvious before anything is delivered.
 *
 * The bar starts docked above the bottom edge and can be dragged anywhere by
 * its header, because what is worth annotating is sometimes exactly what the
 * bar is covering.
 */
/** Matches the binding handled in the controller. */
const SHORTCUT = isMac() ? '⌘.' : 'Ctrl+.';

/** Height of the docked bar plus its offset, for panels placing themselves. */
const DOCKED_BAND = 190;

export function createTray(layer: HTMLElement, handlers: TrayHandlers): Tray {
  const picker = createAgentPicker(() => {
    handlers.onTargetChange();
    showStatusForSelection();
    updateSendDisabled();
  });

  const stack = createAnnotationStack({
    onRemove: (index) => handlers.onRemoveSelection(index),
    onEdit: (index) => handlers.onEditSelection(index),
    onReselect: (index) => handlers.onReselect(index),
    onMove: (index, direction) => handlers.onMoveSelection(index, direction),
    onSetTriage: (index, triage) => handlers.onSetTriage(index, triage),
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
  const refresh = iconButton('circle circle--sm', REFRESH_ICON, 'Refresh agents');

  const note = make('textarea', {
    className: 'tray__note',
    attributes: { rows: '1', placeholder: 'Optional notes…', 'aria-label': 'Page note' },
  });

  const status = make('span', { className: 'status status--idle', text: '' });

  const annotate = iconButton('circle tray__tool', ANNOTATE_ICON, 'Annotate');
  const tip = make('span', { className: 'tip' });
  const annotateSlot = fill(make('div', { className: 'tip-anchor' }), tip, annotate);

  const pen = iconButton('circle tray__tool', PEN_ICON, 'Draw on page');
  const penTip = make('span', { className: 'tip', text: 'Draw on page' });
  const penSlot = fill(make('div', { className: 'tip-anchor' }), penTip, pen);

  const consoleButton = iconButton('circle tray__tool', CONSOLE_ICON, 'Capture console errors');
  const consoleTip = make('span', { className: 'tip', text: 'Capture console errors' });
  const consoleSlot = fill(make('div', { className: 'tip-anchor' }), consoleTip, consoleButton);

  const queueCount = make('span', { text: '0 annotations' });
  const queue = fill(
    make('button', {
      className: 'tray__queue',
      attributes: { type: 'button', hidden: '', 'aria-expanded': 'false' },
    }),
    icon(ANNOTATE_ICON),
    queueCount,
  );

  const clear = make('button', { className: 'pill', text: 'Clear' });
  const send = iconButton('circle circle--accent tray__send', ARROW_UP_ICON, 'Send');
  const sendSlot = fill(
    make('div', { className: 'tip-anchor' }),
    make('span', { className: 'tip', text: 'Send' }),
    send,
  );

  const head = fill(
    make('div', { className: 'tray__head' }),
    picker.element(),
    fill(make('div', { className: 'tray__head-actions' }), collapse, refresh),
  );

  const panel = fill(
    make('div', { className: 'panel tray', attributes: { hidden: '' } }),
    stack.element(),
    head,
    pickRow.element,
    note,
    fill(
      make('div', { className: 'tray__actions' }),
      annotateSlot,
      penSlot,
      consoleSlot,
      queue,
      status,
      clear,
      sendSlot,
    ),
  );
  layer.append(panel);

  const drag = makeDraggable(panel, head, {
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

  let selectionCount = 0;
  let annotating = false;
  let drawing = false;

  collapse.addEventListener('click', toggleCollapsed);
  refresh.addEventListener('click', () => handlers.onRefresh());
  annotate.addEventListener('click', () => handlers.onToggleAnnotate());
  pen.addEventListener('click', () => handlers.onToggleDraw());
  consoleButton.addEventListener('click', () => handlers.onToggleConsole());
  clear.addEventListener('click', () => handlers.onClear());
  send.addEventListener('click', () => handlers.onSend());
  note.addEventListener('input', () => {
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

  /** The card sits above the bar unless the bar has been parked too high. */
  function placeStack(): void {
    const room = panel.getBoundingClientRect().top;
    stack.element().classList.toggle('stack--below', room < 240);
  }

  function toggleCollapsed(): void {
    const collapsed = panel.classList.toggle('tray--collapsed');
    if (collapsed) closeQueue();
    collapse.title = collapsed ? 'Expand the toolbar' : 'Collapse the toolbar';
    collapse.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
  }

  function closeQueue(): void {
    stack.close();
    queue.setAttribute('aria-expanded', 'false');
    queue.classList.remove('tray__queue--on');
  }

  /** A busy agent still accepts work, but the user should know before sending. */
  function showStatusForSelection(): void {
    const target = picker.selected();

    if (target?.status === 'working') {
      setStatus('busy · confirm to queue', 'busy');
    } else if (target?.status === 'blocked') {
      setStatus('blocked · choose another', 'error');
    } else if (target?.status === 'unknown') {
      setStatus('status unknown', 'busy');
    } else {
      setStatus('', 'idle');
    }
  }

  function setStatus(text: string, tone: StatusTone): void {
    status.textContent = text;
    // The row is only so wide; the full sentence stays reachable on hover.
    status.title = text;
    status.className = `status status--${tone}`;
  }

  function updateSendDisabled(): void {
    send.disabled = !hasSendableContent() || !isAllowedTarget(picker.selected());
  }

  function hasSendableContent(): boolean {
    return selectionCount > 0 || note.value.trim() !== '';
  }

  function updateMode(): void {
    annotate.classList.toggle('circle--on', annotating);
    pen.classList.toggle('circle--on', drawing);
    tip.textContent = annotating ? `Stop annotating  ${SHORTCUT}` : `Annotate  ${SHORTCUT}`;
    penTip.textContent = drawing ? 'Finish drawing' : 'Draw on page';
  }

  return {
    setTargets(next, message) {
      picker.setTargets(next, message);

      if (next.length === 0) {
        setStatus(message ?? '', 'error');
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
      queueCount.textContent = `${items.length} annotation${items.length === 1 ? '' : 's'}`;
      if (items.length === 0) closeQueue();
      updateSendDisabled();
    },

    setStatus,

    setRefreshing(refreshing) {
      refresh.disabled = refreshing;
      refresh.classList.toggle('circle--spin', refreshing);
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
      consoleTip.textContent = on
        ? `Console errors on · ${count} so far`
        : 'Capture console errors';
    },

    // Once dragged, the bar is wherever the user put it, so nothing along the
    // bottom is reserved and panels may use the full height.
    reservedBottom: () =>
      panel.hasAttribute('hidden') || panel.classList.contains('tray--floating') ? 0 : DOCKED_BAND,

    selectedPaneId: () => picker.selected()?.paneId ?? null,
    selectedTarget: () => picker.selected(),
    pageNote: () => note.value.trim(),
    setPageNote(value) {
      note.value = value;
      updateSendDisabled();
    },
    clearPageNote() {
      note.value = '';
      updateSendDisabled();
    },
    dock() {
      docked = true;
      drag.clear();
      clearPanelPosition();
      placeStack();
    },
    show: () => {
      panel.removeAttribute('hidden');
      placeStack();
    },
    hide: () => {
      picker.close();
      closeQueue();
      panel.setAttribute('hidden', '');
    },
    destroy: () => {
      picker.close();
      closeQueue();
      drag.destroy();
    },
  };
}

function iconButton(
  className: string,
  markup: string,
  label: string,
  title = label,
): HTMLButtonElement {
  const button = make('button', {
    className,
    attributes: { type: 'button', title, 'aria-label': label },
  });
  button.innerHTML = markup;
  return button;
}

function icon(markup: string): HTMLElement {
  const element = make('span', { className: 'tray__queue-icon' });
  element.innerHTML = markup;
  return element;
}

function isAllowedTarget(target: Target | null): boolean {
  return target !== null && target.status !== 'blocked';
}

function stopKeyboardLeak(event: KeyboardEvent): void {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isMac(): boolean {
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return (modern?.platform ?? navigator.platform).toLowerCase().includes('mac');
}
