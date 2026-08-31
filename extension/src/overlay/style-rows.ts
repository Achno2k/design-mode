import { toHex, type EditableProperty } from '../inspect/editable.ts';
import { fill, make } from './dom.ts';
import { CHEVRON_ICON } from './icons.ts';

/**
 * The controls the editor is made of.
 *
 * Every row is the same shape — a label, a control, and a value that can be
 * read and written — so the editor above can treat the text row and a colour
 * row identically and never branch on which kind it is holding.
 */

/** One label-and-control line in the panel. */
export interface Row {
  element: HTMLElement;
  value(): string;
  setValue(value: string): void;
  onInput(handler: (value: string) => void): void;
}

/** A row bound to a CSS property. */
export interface StyleRow extends Row {
  property: EditableProperty;
}

/** Build the row for one editable CSS property. */
export function createStyleRow(property: EditableProperty): StyleRow {
  const control = property.kind === 'color' ? colorControl() : plainControl(property);
  // `control` also carries an `element`; the row's line must win over it.
  return { ...control, property, element: line(property.label, control.element) };
}

/**
 * The row that rewrites the element's copy.
 *
 * It sits apart from the CSS rows because it is not a style: it is the only
 * control here that changes what the page says rather than how it looks.
 */
export function createTextRow(): Row {
  const input = make('input', {
    className: 'field field--text',
    attributes: { type: 'text', spellcheck: 'false' },
  });
  const control = fill(make('div', { className: 'control' }), input);

  let notify: (value: string) => void = () => {};
  input.addEventListener('input', () => notify(input.value));

  return {
    element: line('Text', control),
    value: () => input.value,
    setValue(value: string) {
      input.value = value;
    },
    onInput(handler: (value: string) => void) {
      notify = handler;
    },
  };
}

function line(label: string, control: HTMLElement): HTMLElement {
  return fill(
    make('div', { className: 'editor__row' }),
    make('label', { className: 'editor__label', text: label }),
    control,
  );
}

/** A hex swatch beside the real value, so any CSS colour syntax still works. */
function colorControl(): Row {
  const swatch = make('input', { className: 'swatch', attributes: { type: 'color' } });
  const text = make('input', { className: 'field', attributes: { type: 'text' } });
  const element = fill(make('div', { className: 'control control--color' }), swatch, text);

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

function plainControl(property: EditableProperty): Row {
  return property.kind === 'choice' ? choiceControl(property) : inputControl(property);
}

function choiceControl(property: EditableProperty): Row {
  const select = make('select', { className: 'field field--select' });
  fill(
    select,
    make('option', { text: '—', attributes: { value: '' } }),
    ...(property.choices ?? []).map((choice) =>
      make('option', { text: choice, attributes: { value: choice } }),
    ),
  );

  const element = fill(make('div', { className: 'control control--select' }), select, chevron());
  let notify: (value: string) => void = () => {};
  let customOption: HTMLOptionElement | null = null;

  /** A live value can be anything the page already uses, not just our choices. */
  function syncValue(value: string): void {
    const choices = property.choices ?? [];
    if (value === '' || choices.includes(value)) {
      customOption?.remove();
      customOption = null;
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
    setValue: syncValue,
    onInput(handler: (value: string) => void) {
      notify = handler;
    },
  };
}

function inputControl(property: EditableProperty): Row {
  const input = make('input', {
    className: 'field',
    attributes:
      property.kind === 'number'
        ? { type: 'number', step: String(property.step ?? 1) }
        : { type: 'text' },
  });

  const element = fill(make('div', { className: 'control' }), input);
  if (property.kind === 'number') element.classList.add('control--narrow');
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

/** The dropdown arrow, in its own box beside the value the way the design shows it. */
function chevron(): HTMLElement {
  const element = make('span', { className: 'control__chevron' });
  element.innerHTML = CHEVRON_ICON;
  return element;
}
