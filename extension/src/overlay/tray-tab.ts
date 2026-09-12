import type { TraySide } from '../lib/panel-position.ts';
import { fill, make } from './dom.ts';
import { ANNOTATE_ICON, PEN_ICON } from './icons.ts';

/** The tab left on the screen edge while the bar is collapsed. */
export interface EdgeTab {
  element: HTMLElement;
  /** Which edge it clings to. */
  setSide(side: TraySide): void;
  /** How many annotations are waiting behind it; zero hides the badge. */
  setCount(count: number): void;
  /** Which tool is in hand, so the glyph says what expanding returns you to. */
  setMode(mode: 'annotate' | 'draw' | 'off'): void;
  setVisible(visible: boolean): void;
}

/**
 * Collapsing exists to hand the page back, so the bar goes away completely
 * and only this stays behind: the mode glyph and, when something is queued,
 * a count — because sending a review you forgot about would be a surprise.
 * Narrow enough to sit beside a site's own edge furniture without covering it.
 */
export function createEdgeTab(layer: HTMLElement, onExpand: () => void): EdgeTab {
  const count = make('span', { className: 'tray-tab__count', attributes: { hidden: '' } });
  const icon = make('span', { className: 'tray-tab__icon' });
  icon.innerHTML = ANNOTATE_ICON;
  const element = fill(
    make('button', {
      className: 'tray-tab',
      attributes: {
        type: 'button',
        hidden: '',
        title: 'Expand the toolbar',
        'aria-label': 'Expand the toolbar',
      },
    }),
    icon,
    count,
  );
  element.addEventListener('click', onExpand);
  layer.append(element);

  return {
    element,
    setSide(side) {
      element.classList.toggle('tray-tab--left', side === 'left');
    },
    setMode(mode) {
      icon.innerHTML = mode === 'draw' ? PEN_ICON : ANNOTATE_ICON;
      element.classList.toggle('tray-tab--annotate', mode === 'annotate');
      element.classList.toggle('tray-tab--draw', mode === 'draw');
    },
    setCount(total) {
      count.hidden = total === 0;
      count.textContent = String(total);
      const queued = `${total} annotation${total === 1 ? '' : 's'}`;
      element.title = total === 0 ? 'Expand the toolbar' : `Expand the toolbar · ${queued}`;
    },
    setVisible(visible) {
      element.hidden = !visible;
    },
  };
}
