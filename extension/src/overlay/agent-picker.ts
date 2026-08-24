import type { Target } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';
import { CHEVRON_ICON } from './icons.ts';

/** The agent chooser in the toolbar header. */
export interface AgentPicker {
  setTargets(targets: Target[], message?: string): void;
  selected(): Target | null;
  /** Shut the menu — the toolbar does this before it moves. */
  close(): void;
  element(): HTMLElement;
}

/**
 * Choose which agent receives the review.
 *
 * A native `<select>` cannot show a harness, a pane id and a live status on one
 * row, and on a page with two dozen agents an ungrouped list is unreadable — so
 * this is built out of buttons instead. Options are grouped by harness in the
 * order the harnesses first appear, which keeps the daemon's ranking intact:
 * its best guess stays at the top.
 */
export function createAgentPicker(onChange: () => void): AgentPicker {
  const name = make('span', { className: 'picker__name' });
  const pane = make('span', { className: 'picker__pane' });
  const chevron = make('span', { className: 'picker__chevron' });
  chevron.innerHTML = CHEVRON_ICON;

  const trigger = fill(
    make('button', {
      className: 'picker__trigger',
      attributes: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    }),
    name,
    pane,
    chevron,
  );

  const menu = make('div', { className: 'picker__menu', attributes: { role: 'listbox' } });

  const root = fill(
    make('div', { className: 'picker' }),
    make('span', { className: 'picker__label', text: 'Agent' }),
    trigger,
    menu,
  );

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
    onChange();
  }

  function showTrigger(): void {
    const target = current();
    name.textContent = target?.label ?? '';
    pane.textContent = target?.paneId ?? '';
    pane.hidden = target === null;
  }

  function markSelected(): void {
    for (const option of menu.querySelectorAll('.picker__option')) {
      const chosen = option.getAttribute('data-pane-id') === selectedPaneId;
      option.classList.toggle('picker__option--on', chosen);
      option.setAttribute('aria-selected', String(chosen));
    }
  }

  function buildMenu(): void {
    const groups = groupByHarness(targets);
    let index = 0;

    menu.replaceChildren(
      ...groups.map((group) =>
        fill(
          make('div', { className: 'picker__group' }),
          make('div', { className: 'picker__harness', text: group.harness }),
          ...group.targets.map((target) => option(target, index++)),
        ),
      ),
    );
  }

  /** Rows fade in one after another, which reads as the menu unrolling. */
  function option(target: Target, index: number): HTMLElement {
    const button = fill(
      make('button', {
        className: 'picker__option',
        attributes: { type: 'button', role: 'option', 'data-pane-id': target.paneId },
      }),
      make('span', { className: `dot dot--${target.status}` }),
      make('span', { className: 'picker__option-name', text: target.label }),
      make('span', { className: 'picker__option-pane', text: target.paneId }),
    );

    button.style.setProperty('--stagger', `${Math.min(index, 8) * 18}ms`);
    button.addEventListener('click', () => choose(target.paneId));
    return button;
  }

  trigger.addEventListener('click', () => {
    if (targets.length === 0) return;
    setOpen(!open);
  });

  return {
    setTargets(next, message) {
      targets = next;
      trigger.disabled = next.length === 0;

      if (next.length === 0) {
        setOpen(false);
        selectedPaneId = null;
        menu.replaceChildren();
        name.textContent = message ?? 'No agent found for this page';
        pane.hidden = true;
        return;
      }

      const keep = next.some((target) => target.paneId === selectedPaneId);
      selectedPaneId = keep ? selectedPaneId : (next[0]?.paneId ?? null);

      buildMenu();
      showTrigger();
      markSelected();
    },

    selected: current,
    close: () => setOpen(false),
    element: () => root,
  };
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
