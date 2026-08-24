import {
  EDITABLE_PROPERTIES,
  applyValue,
  readValue,
  toCssValue,
  toHex,
  type EditableProperty,
} from '../inspect/editable.ts';
import type { StyleChange } from '../lib/protocol.ts';
import { fill, make } from './dom.ts';
import { CHEVRON_ICON } from './icons.ts';

/** Live style editing for one element. */
export interface StyleEditor {
  /** Point the editor at an element and read its current values. */
  attach(element: Element): void;
  /** Undo every live edit and forget the element. */
  reset(): void;
  /** Keep the edits and report them, for the note sent to the agent. */
  commit(): StyleChange[];
  element(): HTMLElement;
}

/**
 * Edit styles on the page and see the result immediately.
 *
 * Edits are written as inline styles, so they are visible at once and vanish on
 * the next reload — this is a way to describe a change precisely, not a way to
 * make one. What the user tried is recorded and sent along with the comment, so
 * the agent gets an exact before and after rather than a vague description.
 */
export function createStyleEditor(): StyleEditor {
  const rows = EDITABLE_PROPERTIES.map(createRow);
  const panel = fill(
    make('div', { className: 'editor' }),
    ...rows.map((row) => row.element),
  );

  let target: Element | null = null;
  const originalEffective = new Map<string, string>();
  const originalInline = new Map<string, { value: string; priority: string }>();

  function attach(element: Element): void {
    if (target === element && originalEffective.size > 0) return;

    target = element;
    originalEffective.clear();
    originalInline.clear();

    const style = (element as HTMLElement).style;
    for (const row of rows) {
      const property = row.property.property;
      const value = readValue(element, row.property);
      originalEffective.set(property, value);
      originalInline.set(property, {
        value: style.getPropertyValue(property),
        priority: style.getPropertyPriority(property),
      });
      row.setValue(value);
    }
  }

  function reset(): void {
    if (target !== null) {
      const style = (target as HTMLElement).style;
      for (const row of rows) {
        const property = row.property.property;
        const original = originalInline.get(property);
        if (original === undefined || original.value === '') {
          style.removeProperty(property);
        } else if (original.priority === '') {
          style.setProperty(property, original.value);
        } else {
          style.setProperty(property, original.value, original.priority);
        }
      }
    }
    target = null;
    originalEffective.clear();
    originalInline.clear();
  }

  function commit(): StyleChange[] {
    const changes: StyleChange[] = [];

    for (const row of rows) {
      const property = row.property.property;
      const before = originalEffective.get(property) ?? '';
      const after = row.value();
      if (before === after) continue;

      changes.push({
        property,
        from: toCssValue(row.property, before) || 'unset',
        to: toCssValue(row.property, after) || 'unset',
      });
    }

    target = null;
    originalEffective.clear();
    originalInline.clear();
    return changes;
  }

  for (const row of rows) {
    row.onInput((value) => {
      if (target !== null) applyValue(target, row.property, value);
    });
  }

  return { attach, reset, commit, element: () => panel };
}

/** One label-and-control line in the panel. */
interface Row {
  property: EditableProperty;
  element: HTMLElement;
  value(): string;
  setValue(value: string): void;
  onInput(handler: (value: string) => void): void;
}

function createRow(property: EditableProperty): Row {
  const control = property.kind === 'color' ? colorControl() : plainControl(property);
  const line = fill(
    make('div', { className: 'editor__row' }),
    make('label', { className: 'editor__label', text: property.label }),
    control.element,
  );

  // `control` also carries an `element`; the row's line must win over it.
  return { ...control, property, element: line };
}

/** A hex swatch beside the real value, so any CSS colour syntax still works. */
function colorControl() {
  const swatch = make('input', { className: 'swatch', attributes: { type: 'color' } });
  const text = make('input', { className: 'field', attributes: { type: 'text' } });
  const element = fill(make('div', { className: 'control' }), swatch, text);

  let notify: (value: string) => void = () => {};

  swatch.addEventListener('input', () => {
    text.value = swatch.value;
    notify(swatch.value);
  });
  text.addEventListener('input', () => {
    swatch.value = toHex(text.value);
    notify(text.value);
  });

  return {
    element,
    value: () => text.value,
    setValue(value: string) {
      text.value = value;
      swatch.value = toHex(value);
    },
    onInput(handler: (value: string) => void) {
      notify = handler;
    },
  };
}

function plainControl(property: EditableProperty) {
  if (property.kind === 'choice') {
    const select = make('select', { className: 'field field--select' });
    fill(
      select,
      make('option', { text: '—', attributes: { value: '' } }),
      ...(property.choices ?? []).map((choice) => make('option', { text: choice, attributes: { value: choice } })),
    );

    const element = fill(make('div', { className: 'control control--select' }), select, chevron());
    let notify: (value: string) => void = () => {};
    let customOption: HTMLOptionElement | null = null;

    function syncValue(value: string): void {
      const choices = property.choices ?? [];
      const knownChoice = value === '' || choices.includes(value);

      if (knownChoice) {
        if (customOption !== null) {
          customOption.remove();
          customOption = null;
        }
        select.value = value;
        return;
      }

      if (customOption === null) {
        customOption = make('option', { attributes: { value }, text: value });
        select.insertBefore(customOption, select.children[1] ?? null);
      } else {
        customOption.value = value;
        customOption.textContent = value;
      }

      select.value = value;
    }

    select.addEventListener('input', () => notify(select.value));
    select.addEventListener('change', () => notify(select.value));

    return {
      element,
      value: () => select.value,
      setValue(value: string) {
        syncValue(value);
      },
      onInput(handler: (value: string) => void) {
        notify = handler;
      },
    };
  }

  const input = make('input', {
    className: 'field',
    attributes:
      property.kind === 'number'
        ? { type: 'number', step: String(property.step ?? 1) }
        : { type: 'text' },
  });

  const element = fill(make('div', { className: 'control' }), input);
  if (property.unit !== undefined) {
    element.classList.add('control--unit');
    element.append(make('span', { className: 'control__unit', text: property.unit }));
  }

  let notify: (value: string) => void = () => {};
  input.addEventListener('input', () => notify(input.value));
  input.addEventListener('change', () => notify(input.value));

  return {
    element,
    value: () => input.value,
    setValue(value: string) {
      input.value = value;
    },
    onInput(handler: (value: string) => void) {
      notify = handler;
    },
  };
}

/** The dropdown arrow, drawn beside the value the way the design shows it. */
function chevron(): HTMLElement {
  const element = make('span', { className: 'control__chevron' });
  element.innerHTML = CHEVRON_ICON;
  return element;
}
