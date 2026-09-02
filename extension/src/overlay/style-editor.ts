import {
  EDITABLE_PROPERTIES,
  applyValue,
  readValue,
  toCssValue,
  type EditorGroup,
} from '../inspect/editable.ts';
import {
  collectMatchingRules,
  readAuthoredValue,
  type AuthoredValue,
} from '../inspect/authored-styles.ts';
import { readTextContent, writeTextContent } from '../inspect/text-content.ts';
import type { StyleChange, TextChange } from '../lib/protocol.ts';
import type { BoxModel } from './box-model.ts';
import { fill, make } from './dom.ts';
import { createStyleRow, createTextRow, type StyleRow } from './style-rows.ts';

/** Live edits for one element, kept reversible after they are committed. */
export interface CommittedStyleEdits {
  changes: StyleChange[];
  /** Present only when the element's copy was rewritten. */
  textChange?: TextChange;
  apply(): void;
  revert(): void;
}

export interface StyleEditor {
  /** Point the editor at an element and read its current values. */
  attach(element: Element): void;
  /** Undo every live edit and forget the element. */
  reset(): void;
  /** True when anything on the element has actually been changed. */
  hasEdits(): boolean;
  /** Keep the edits and return a reversible effect. */
  commit(): CommittedStyleEdits;
  element(): HTMLElement;
}

export interface StyleEditorOptions {
  /** Fires on every edit, so the composer can enable or disable its submit. */
  onChange?: () => void;
  /** Shown over the element while a spacing row has focus or the pointer. */
  boxModel?: BoxModel;
}

/** Rows whose value is easier to judge with the element's spacing drawn on the page. */
const BOX_PROPERTIES = new Set(['padding', 'margin']);

/**
 * Edit an element on the page and see the result immediately.
 *
 * Style edits are written as inline styles and the copy is written straight
 * onto the element, so both are visible at once and both vanish on the next
 * reload — this is a way to describe a change precisely, not a way to make one.
 * What the user tried is recorded and sent with the comment, so the agent gets
 * an exact before and after rather than a vague description.
 */
export function createStyleEditor(options: StyleEditorOptions = {}): StyleEditor {
  const notifyChange = options.onChange ?? (() => {});

  const textRow = createTextRow();
  const styleRows = EDITABLE_PROPERTIES.map(createStyleRow);

  const textGroup = fill(make('div', { className: 'editor__group' }), textRow.element);
  const panel = fill(
    make('div', { className: 'editor' }),
    textGroup,
    ...groupRows(styleRows).map((rows) =>
      fill(make('div', { className: 'editor__group' }), ...rows.map((row) => row.element)),
    ),
  );

  let target: Element | null = null;
  let originalText: string | null = null;
  const originalEffective = new Map<string, string>();
  const originalInline = new Map<string, InlineValue>();
  const originalAuthored = new Map<string, AuthoredValue>();

  function attach(element: Element): void {
    if (target === element && originalEffective.size > 0) return;

    target = element;
    originalEffective.clear();
    originalInline.clear();
    originalAuthored.clear();

    // An element with element children has no single copy to rewrite, so the
    // row is hidden rather than shown in a state that would destroy its subtree.
    originalText = readTextContent(element);
    textGroup.hidden = originalText === null;
    textRow.setValue(originalText ?? '');

    // Snapshotted before any edit, so the authored value is the page's own and
    // never one of our inline overrides.
    const rules = collectMatchingRules(element);
    const style = (element as HTMLElement).style;
    for (const row of styleRows) {
      const property = row.property.property;
      const value = readValue(element, row.property);
      originalEffective.set(property, value);
      originalInline.set(property, {
        value: style.getPropertyValue(property),
        priority: style.getPropertyPriority(property),
      });
      const authored = readAuthoredValue(rules, element, property);
      if (authored !== undefined) originalAuthored.set(property, authored);
      row.setValue(value);
    }
  }

  function reset(): void {
    if (target !== null) {
      const style = (target as HTMLElement).style;
      for (const row of styleRows) restoreProperty(style, row.property.property, originalInline);
      if (originalText !== null) writeTextContent(target, originalText);
    }
    forget();
  }

  function hasEdits(): boolean {
    if (target === null) return false;
    if (changedText(originalText, textRow.value()) !== null) return true;
    return changedRows(styleRows, originalEffective, originalAuthored).length > 0;
  }

  function commit(): CommittedStyleEdits {
    if (target === null) return emptyCommit();

    const element = target as HTMLElement;
    const changes = changedRows(styleRows, originalEffective, originalAuthored);
    const properties = new Set(changes.map((change) => change.property));
    const styleBefore = selectInlineValues(originalInline, properties);
    const styleAfter = readInlineValues(element, properties);

    // Rows nudged and put back on their original value are not edits, so their
    // inline styles are returned to what the page had before the composer opened.
    for (const row of styleRows) {
      if (!properties.has(row.property.property)) {
        restoreProperty(element.style, row.property.property, originalInline);
      }
    }

    const textChange = changedText(originalText, textRow.value());
    forget();

    return {
      changes,
      ...(textChange === null ? {} : { textChange }),
      apply: () => {
        restoreProperties(element, styleAfter);
        if (textChange !== null) writeTextContent(element, textChange.to);
      },
      revert: () => {
        restoreProperties(element, styleBefore);
        if (textChange !== null) writeTextContent(element, textChange.from);
      },
    };
  }

  function forget(): void {
    options.boxModel?.hide();
    target = null;
    originalText = null;
    originalEffective.clear();
    originalInline.clear();
    originalAuthored.clear();
  }

  // Several rows can hold attention at once (one focused, another hovered), so
  // the bands stay up until the last of them lets go.
  const attentiveBoxRows = new Set<StyleRow>();

  function refreshBoxModel(): void {
    if (target !== null && attentiveBoxRows.size > 0) options.boxModel?.show(target);
    else options.boxModel?.hide();
  }

  textRow.onInput((value) => {
    if (target !== null) writeTextContent(target, value);
    notifyChange();
  });

  for (const row of styleRows) {
    const isBoxRow = BOX_PROPERTIES.has(row.property.property);
    row.onInput((value) => {
      if (target !== null) applyValue(target, row.property, value);
      if (isBoxRow) refreshBoxModel();
      notifyChange();
    });
    if (isBoxRow) {
      row.onFocusChange((active) => {
        if (active) attentiveBoxRows.add(row);
        else attentiveBoxRows.delete(row);
        refreshBoxModel();
      });
    }
  }

  return { attach, reset, hasEdits, commit, element: () => panel };
}

/** Keep the declared order, but break it into the bands the design separates. */
function groupRows(rows: StyleRow[]): StyleRow[][] {
  const bands: StyleRow[][] = [];
  let current: EditorGroup | null = null;

  for (const row of rows) {
    if (row.property.group !== current) {
      current = row.property.group;
      bands.push([]);
    }
    bands[bands.length - 1]?.push(row);
  }
  return bands;
}

function emptyCommit(): CommittedStyleEdits {
  return { changes: [], apply: () => {}, revert: () => {} };
}

/** Null when the copy was left alone, so an untouched row never becomes an edit. */
function changedText(before: string | null, after: string): TextChange | null {
  if (before === null || before === after) return null;
  return { from: before, to: after };
}

/**
 * Each change carries the stylesheet's own value beside the computed one when a
 * rule was found, so the agent edits `var(--space-4)` or `p-4` rather than
 * hunting for where `16px` came from.
 */
function changedRows(
  rows: StyleRow[],
  originalEffective: Map<string, string>,
  originalAuthored: Map<string, AuthoredValue>,
): StyleChange[] {
  return rows.flatMap((row) => {
    const property = row.property.property;
    const before = originalEffective.get(property) ?? '';
    const after = row.value();
    if (before === after) return [];

    const authored = originalAuthored.get(property);
    return [
      {
        property,
        from: toCssValue(row.property, before) || 'unset',
        to: toCssValue(row.property, after) || 'unset',
        ...(authored === undefined
          ? {}
          : {
              fromAuthored: authored.value,
              authoredBy: {
                selector: authored.selector,
                ...(authored.sheet === undefined ? {} : { sheet: authored.sheet }),
                ...(authored.classes === undefined ? {} : { classes: authored.classes }),
              },
            }),
      },
    ];
  });
}

type InlineValue = { value: string; priority: string };

function selectInlineValues(
  values: Map<string, InlineValue>,
  properties: Set<string>,
): Map<string, InlineValue> {
  return new Map(Array.from(values).filter(([property]) => properties.has(property)));
}

function readInlineValues(element: HTMLElement, properties: Set<string>): Map<string, InlineValue> {
  return new Map(
    Array.from(properties, (property) => [
      property,
      {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      },
    ]),
  );
}

function restoreProperties(element: HTMLElement, values: Map<string, InlineValue>): void {
  for (const [property, value] of values) setInlineValue(element.style, property, value);
}

function restoreProperty(
  style: CSSStyleDeclaration,
  property: string,
  values: Map<string, InlineValue>,
): void {
  const value = values.get(property);
  if (value !== undefined) setInlineValue(style, property, value);
}

function setInlineValue(style: CSSStyleDeclaration, property: string, value: InlineValue): void {
  if (value.value === '') style.removeProperty(property);
  else style.setProperty(property, value.value, value.priority);
}
