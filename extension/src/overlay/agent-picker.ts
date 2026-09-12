import type { AgentStatus, Target } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';
import { CHECK_ICON, CHEVRON_ICON, REFRESH_ICON } from './icons.ts';

/** The agent chooser in the toolbar. */
export interface AgentPicker {
  setTargets(targets: Target[]): void;
  selected(): Target | null;
  /** Spin the refresh row while herdr is being asked again. */
  setRefreshing(refreshing: boolean): void;
  /** Shut the menu — the toolbar does this before it moves. */
  close(): void;
  element(): HTMLElement;
}

export interface AgentPickerHandlers {
  onChange(): void;
  onRefresh(): void;
}

/**
 * Choose which agent receives the review.
 *
 * A native `<select>` cannot show a harness, a pane id and a live status on one
 * row, and on a page with two dozen agents an ungrouped list is unreadable — so
 * this is built out of buttons instead. Options are grouped by harness in the
 * order the harnesses first appear, which keeps the daemon's ranking intact:
 * its best guess stays at the top. Refreshing lives at the foot of the menu,
 * next to the list it changes.
 */
export function createAgentPicker(handlers: AgentPickerHandlers): AgentPicker {
  const dot = make('span', { className: 'dot dot--idle picker__dot' });
  const name = make('span', { className: 'picker__name' });
  const pane = make('span', { className: 'picker__pane' });
  const chevron = make('span', { className: 'picker__chevron' });
  chevron.innerHTML = CHEVRON_ICON;

  const trigger = fill(
    make('button', {
      className: 'pill pill--outline picker__trigger',
      attributes: {
        type: 'button',
        title: 'Choose the agent that receives the review',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
      },
    }),
    dot,
    name,
    pane,
    chevron,
  );

  const filter = make('input', {
    className: 'picker__filter',
    attributes: { type: 'search', placeholder: 'Filter agents…', 'aria-label': 'Filter agents', hidden: '' },
  });
  const list = make('div', { className: 'picker__list', attributes: { role: 'listbox' } });
  const refresh = make('button', {
    className: 'picker__refresh',
    attributes: { type: 'button', title: 'Ask herdr for the agents again' },
  });
  const refreshIcon = make('span', { className: 'picker__refresh-icon' });
  refreshIcon.innerHTML = REFRESH_ICON;
  fill(refresh, refreshIcon, make('span', { text: 'Refresh' }));

  const total = make('span', { className: 'picker__total' });
  const menu = fill(
    make('div', { className: 'picker__menu', attributes: { 'data-drag-ignore': '' } }),
    filter,
    list,
    fill(make('div', { className: 'picker__foot' }), total, make('span', { className: 'picker__foot-rule' }), refresh),
  );
  const root = fill(make('div', { className: 'picker' }), trigger, menu);

  let targets: Target[] = [];
  let selectedPaneId: string | null = null;
  let open = false;

  function current(): Target | null {
    return targets.find((target) => target.paneId === selectedPaneId) ?? null;
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;

    menu.classList.toggle('picker__menu--open', open);
    root.classList.toggle('picker--open', open);
    trigger.setAttribute('aria-expanded', String(open));

    if (open) {
      // The toolbar can be dragged to the top of the window, where a menu
      // rising out of it would open off screen.
      menu.classList.toggle('picker__menu--below', trigger.getBoundingClientRect().top < 320);
      watchOutsidePresses(true);
      window.addEventListener('keydown', onMenuKeyDown, true);
      filter.value = '';
      applyFilter();
      if (!filter.hidden) filter.focus();
    } else {
      watchOutsidePresses(false);
      window.removeEventListener('keydown', onMenuKeyDown, true);
    }
  }

  /**
   * Close on a press anywhere but the menu.
   *
   * The overlay lives in a *closed* shadow root, and `composedPath()` hides a
   * closed tree's contents from listeners outside it — so to the window a press
   * on the toolbar is indistinguishable from a press on the page, and a single
   * window listener would close the menu on the very click meant to toggle it.
   * The two cases are therefore watched separately: the shadow root judges
   * presses inside the overlay, and the window only decides about presses that
   * missed the overlay altogether.
   */
  function watchOutsidePresses(watching: boolean): void {
    const scope = root.getRootNode();
    const host = scope instanceof ShadowRoot ? scope.host : null;

    if (watching) {
      scope.addEventListener('pointerdown', onScopePointer, true);
      if (host !== null) window.addEventListener('pointerdown', onPagePointer, true);
      return;
    }

    scope.removeEventListener('pointerdown', onScopePointer, true);
    window.removeEventListener('pointerdown', onPagePointer, true);
  }

  function onScopePointer(event: Event): void {
    if (!event.composedPath().includes(root)) setOpen(false);
  }

  function onPagePointer(event: Event): void {
    const scope = root.getRootNode();
    const host = scope instanceof ShadowRoot ? scope.host : null;
    if (host === null || !event.composedPath().includes(host)) setOpen(false);
  }

  /** Escape belongs to the menu while it is up, not to the session. */
  function onMenuKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    trigger.focus();
  }

  function choose(paneId: string): void {
    selectedPaneId = paneId;
    setOpen(false);
    showTrigger();
    markSelected();
    handlers.onChange();
  }

  function showTrigger(): void {
    const target = current();
    dot.className = `dot dot--${target?.status ?? 'idle'} picker__dot`;
    dot.hidden = target === null;
    name.textContent = target?.label ?? '';
    pane.textContent = target?.paneId ?? '';
    pane.hidden = target === null;
  }

  function markSelected(): void {
    for (const row of list.querySelectorAll('.picker__row')) {
      const chosen = row.getAttribute('data-pane-id') === selectedPaneId;
      row.classList.toggle('picker__row--on', chosen);
      row.setAttribute('aria-selected', String(chosen));
    }
  }

  function buildMenu(): void {
    list.replaceChildren(
      ...groupByHarness(targets).map((group) =>
        fill(
          make('div', { className: 'picker__group' }),
          fill(
            make('div', { className: 'picker__harness' }),
            make('span', { text: group.harness }),
            make('span', { className: 'picker__count', text: String(group.targets.length) }),
          ),
          ...group.targets.map(row),
        ),
      ),
    );
    total.textContent = `${targets.length} agent${targets.length === 1 ? '' : 's'}`;
    // A short list is scanned faster than it is typed at.
    filter.hidden = targets.length <= FILTER_FROM;
  }

  /**
   * Name and pane on the left, a status chip on the right, and a lane for the
   * check beyond it that every row keeps, so the chips line up in a column.
   * The chosen row's chip lights up; the others stay grey unless the agent is
   * busy or blocked, which is worth a colour of its own.
   */
  function row(target: Target): HTMLElement {
    const check = make('span', { className: 'picker__check' });
    check.innerHTML = CHECK_ICON;
    const button = fill(
      make('button', {
        className: 'picker__row',
        attributes: {
          type: 'button',
          role: 'option',
          'data-pane-id': target.paneId,
          'data-search': `${target.label} ${target.paneId} ${target.agent}`.toLowerCase(),
          title: target.label,
        },
      }),
      fill(
        make('span', { className: 'picker__row-body' }),
        make('span', { className: 'picker__row-name', text: target.label }),
        make('span', { className: 'picker__row-meta', text: target.paneId }),
      ),
      fill(
        make('span', { className: `picker__chip picker__chip--${target.status}` }),
        make('span', { className: 'picker__chip-dot' }),
        make('span', { text: describeStatus(target.status) }),
      ),
      check,
    );
    button.addEventListener('click', () => choose(target.paneId));
    return button;
  }

  /** Hide rows that do not match, and any harness left with nothing to show. */
  function applyFilter(): void {
    const needle = filter.value.trim().toLowerCase();
    for (const group of list.querySelectorAll<HTMLElement>('.picker__group')) {
      let shown = 0;
      for (const option of group.querySelectorAll<HTMLElement>('.picker__row')) {
        const match = needle === '' || (option.dataset.search ?? '').includes(needle);
        option.hidden = !match;
        if (match) shown += 1;
      }
      group.hidden = shown === 0;
    }
  }

  filter.addEventListener('input', applyFilter);
  // Typing into the filter must reach neither the page nor the session's keys.
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    filter.addEventListener(type, (event) => {
      if (type === 'keydown' && event.key === 'Escape') return;
      event.stopPropagation();
    });
  }

  trigger.addEventListener('click', () => {
    if (targets.length === 0) return;
    setOpen(!open);
  });
  refresh.addEventListener('click', () => handlers.onRefresh());

  return {
    setTargets(next) {
      targets = next;
      trigger.disabled = next.length === 0;

      // The reason is the status line's to tell; the trigger only says that
      // there is nothing to choose from.
      if (next.length === 0) {
        setOpen(false);
        selectedPaneId = null;
        list.replaceChildren();
        showTrigger();
        name.textContent = 'No agent';
        return;
      }

      const keep = next.some((target) => target.paneId === selectedPaneId);
      selectedPaneId = keep ? selectedPaneId : (next[0]?.paneId ?? null);

      buildMenu();
      showTrigger();
      markSelected();
    },

    selected: current,
    setRefreshing(refreshing) {
      refresh.disabled = refreshing;
      refresh.classList.toggle('picker__refresh--busy', refreshing);
    },
    close: () => setOpen(false),
    element: () => root,
  };
}

/** Lists longer than this get a filter field at the top of the menu. */
const FILTER_FROM = 6;

function describeStatus(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'working':
      return 'Working';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
    case 'unknown':
      return 'Unknown';
  }
}

/** Agents of the same harness, in the order the harnesses first appear. */
function groupByHarness(targets: Target[]): { harness: string; targets: Target[] }[] {
  const groups = new Map<string, Target[]>();

  for (const target of targets) {
    const existing = groups.get(target.agent);
    if (existing === undefined) groups.set(target.agent, [target]);
    else existing.push(target);
  }

  return [...groups].map(([harness, members]) => ({ harness, targets: members }));
}
