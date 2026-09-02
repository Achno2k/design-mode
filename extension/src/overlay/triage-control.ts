import type { ItemCategory, ItemPriority, ItemTriage } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';

/** The category chip and priority select, as one control with one value. */
export interface TriageControl {
  element(): HTMLElement;
  set(triage: ItemTriage | undefined): void;
  value(): ItemTriage | undefined;
}

const CATEGORIES: ItemCategory[] = ['bug', 'polish', 'question'];
const PRIORITIES: ItemPriority[] = ['P1', 'P2', 'P3'];

/**
 * Let the user say what kind of issue an item is and how urgent.
 *
 * One chip cycles through the categories and back to none, so a whole review
 * can be triaged with a few clicks and nothing is ever stuck in a state it
 * cannot leave. The same control appears in the composer and on every queued
 * row, so the two places cannot drift apart.
 */
export function createTriageControl(
  onChange: (triage: ItemTriage | undefined) => void,
): TriageControl {
  let category: ItemCategory | undefined;
  let priority: ItemPriority | undefined;

  const chip = make('button', {
    className: 'triage__chip',
    attributes: { type: 'button', title: 'Click to change the category' },
  });

  const select = make('select', {
    className: 'triage__priority',
    attributes: { 'aria-label': 'Priority' },
  });
  select.append(make('option', { text: 'priority', attributes: { value: '' } }));
  for (const level of PRIORITIES) {
    select.append(make('option', { text: level, attributes: { value: level } }));
  }

  const root = fill(make('span', { className: 'triage' }), chip, select);

  function render(): void {
    chip.textContent = category ?? 'category';
    chip.className = category === undefined ? 'triage__chip' : `triage__chip triage__chip--${category}`;
    select.value = priority ?? '';
    select.classList.toggle('triage__priority--set', priority !== undefined);
  }

  function value(): ItemTriage | undefined {
    if (category === undefined && priority === undefined) return undefined;
    return {
      ...(category === undefined ? {} : { category }),
      ...(priority === undefined ? {} : { priority }),
    };
  }

  chip.addEventListener('click', (event) => {
    event.stopPropagation();
    const next = category === undefined ? 0 : CATEGORIES.indexOf(category) + 1;
    category = CATEGORIES[next];
    render();
    onChange(value());
  });

  select.addEventListener('change', () => {
    priority = PRIORITIES.find((level) => level === select.value);
    render();
    onChange(value());
  });

  // The select takes keyboard input while focused; none of it belongs to the page.
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  render();

  return {
    element: () => root,
    set(triage) {
      category = triage?.category;
      priority = triage?.priority;
      render();
    },
    value,
  };
}
