import type { Target } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';
import { ANNOTATE_ICON, PEN_ICON, REFRESH_ICON } from './icons.ts';

/** Tone of the tray's status line. */
export type StatusTone = 'idle' | 'busy' | 'error' | 'success';

/** The bar along the bottom: which agent, how many selections, and Send. */
export interface Tray {
  setTargets(targets: Target[], message?: string): void;
  setCount(count: number): void;
  setStatus(text: string, tone: StatusTone): void;
  setRefreshing(refreshing: boolean): void;
  /** Reflect whether element picking is currently on. */
  setAnnotating(active: boolean): void;
  /** Reflect whether freehand drawing is currently on. */
  setDrawing(active: boolean): void;
  selectedPaneId(): string | null;
  selectedTarget(): Target | null;
  pageNote(): string;
  clearPageNote(): void;
  show(): void;
  hide(): void;
}

export interface TrayHandlers {
  onSend(): void;
  onRefresh(): void;
  onTargetChange(): void;
  onClear(): void;
  onExit(): void;
  onToggleAnnotate(): void;
  onToggleDraw(): void;
}

/**
 * Show the resolved agent and let the user override it.
 *
 * The daemon's first candidate is only a guess, so it is pre-selected but never
 * sent automatically — the whole point of naming the agent is that a wrong
 * guess is obvious before anything is delivered.
 */
/** Matches the binding handled in the controller. */
const SHORTCUT = isMac() ? '\u2318.' : 'Ctrl+.';

export function createTray(layer: HTMLElement, handlers: TrayHandlers): Tray {
  const dot = make('span', { className: 'dot dot--unknown' });
  const select = make('select', { className: 'tray__select' });
  const refresh = make('button', {
    className: 'circle circle--sm circle--quiet',
    attributes: { type: 'button', title: 'Refresh targets', 'aria-label': 'Refresh targets' },
  });
  refresh.innerHTML = REFRESH_ICON;

  const note = make('textarea', {
    className: 'tray__note',
    attributes: { rows: '1', placeholder: 'Add a note for the whole page…', 'aria-label': 'Page note' },
  });

  const count = make('span', { className: 'tray__count', text: 'Nothing selected' });
  const status = make('span', { className: 'status status--idle', text: '' });

  const annotate = make('button', {
    className: 'circle circle--sm',
    attributes: { type: 'button', 'aria-label': 'Annotate' },
  });
  annotate.innerHTML = ANNOTATE_ICON;

  const tip = make('span', { className: 'tip' });
  const annotateSlot = fill(make('div', { className: 'tip-anchor' }), tip, annotate);

  const pen = make('button', {
    className: 'circle circle--sm',
    attributes: { type: 'button', 'aria-label': 'Draw on page' },
  });
  pen.innerHTML = PEN_ICON;
  const penTip = make('span', { className: 'tip', text: 'Draw on page' });
  const penSlot = fill(make('div', { className: 'tip-anchor' }), penTip, pen);

  const clear = make('button', { className: 'pill', text: 'Clear' });
  const exit = make('button', { className: 'pill', text: 'Exit' });
  const send = make('button', { className: 'pill pill--accent', text: 'Send' });

  const panel = fill(
    make('div', { className: 'panel tray', attributes: { hidden: '' } }),
    fill(make('div', { className: 'tray__agent' }), dot, select, refresh),
    note,
    make('div', { className: 'tray__rule' }),
    fill(
      make('div', { className: 'tray__actions' }),
      annotateSlot,
      penSlot,
      count,
      status,
      spacer(),
      clear,
      exit,
      send,
    ),
  );
  layer.append(panel);

  let targets: Target[] = [];
  let selectionCount = 0;
  let annotating = false;
  let drawing = false;

  select.addEventListener('change', () => {
    handlers.onTargetChange();
    showStatusForSelection();
    updateSendDisabled();
  });
  refresh.addEventListener('click', () => handlers.onRefresh());
  annotate.addEventListener('click', () => handlers.onToggleAnnotate());
  pen.addEventListener('click', () => handlers.onToggleDraw());
  clear.addEventListener('click', () => handlers.onClear());
  exit.addEventListener('click', () => handlers.onExit());
  send.addEventListener('click', () => handlers.onSend());
  note.addEventListener('input', () => updateSendDisabled());

  note.addEventListener('keydown', (event) => {
    // Keep every tray keystroke out of the host page.
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.key !== 'Enter') return;
    if (event.shiftKey) return;

    event.preventDefault();
    if (hasSendableContent() && isAllowedTarget(current())) handlers.onSend();
  });
  note.addEventListener('keypress', stopKeyboardLeak);
  note.addEventListener('keyup', stopKeyboardLeak);

  function current(): Target | undefined {
    return targets.find((target) => target.paneId === select.value);
  }

  /** A busy agent still accepts work, but the user should know before sending. */
  function showStatusForSelection(): void {
    const target = current();
    dot.className = `dot dot--${target?.status ?? 'unknown'}`;

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
    status.className = `status status--${tone}`;
  }

  function updateSendDisabled(): void {
    send.disabled = !hasSendableContent() || !isAllowedTarget(current());
  }

  function hasSendableContent(): boolean {
    return selectionCount > 0 || note.value.trim() !== '';
  }

  function selectPane(paneId: string): void {
    select.value = paneId;
  }

  function updateMode(): void {
    annotate.classList.toggle('circle--on', annotating);
    pen.classList.toggle('circle--on', drawing);
    panel.classList.toggle('tray--idle', !annotating && !drawing);
    tip.textContent = annotating ? `Stop annotating  ${SHORTCUT}` : `Annotate  ${SHORTCUT}`;
    penTip.textContent = drawing ? 'Finish drawing' : 'Draw on page';
  }

  return {
    setTargets(next, message) {
      const previous = select.value;
      targets = next;
      select.disabled = next.length === 0;

      if (next.length === 0) {
        dot.className = 'dot dot--unknown';
        select.replaceChildren(make('option', { text: message ?? 'No agent found for this page' }));
        setStatus(message ?? '', 'error');
        updateSendDisabled();
        return;
      }

      select.replaceChildren(
        ...next.map((target) =>
          make('option', {
            text: `${target.label}  ·  ${target.paneId}`,
            attributes: { value: target.paneId },
          }),
        ),
      );

      if (next.some((target) => target.paneId === previous)) selectPane(previous);
      showStatusForSelection();
      updateSendDisabled();
    },

    setCount(value) {
      selectionCount = value;
      count.textContent = value === 0 ? 'Nothing selected' : `${value} selected`;
      count.classList.toggle('tray__count--empty', value === 0);
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

    selectedPaneId: () => current()?.paneId ?? null,
    selectedTarget: () => current() ?? null,
    pageNote: () => note.value.trim(),
    clearPageNote: () => {
      note.value = '';
      updateSendDisabled();
    },
    show: () => panel.removeAttribute('hidden'),
    hide: () => panel.setAttribute('hidden', ''),
  };
}

function isAllowedTarget(target: Target | undefined): boolean {
  return target !== undefined && target.status !== 'blocked';
}

function stopKeyboardLeak(event: KeyboardEvent): void {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isMac(): boolean {
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return (modern?.platform ?? navigator.platform).toLowerCase().includes('mac');
}

function spacer(): HTMLElement {
  const element = make('span');
  element.style.flex = '1';
  return element;
}
