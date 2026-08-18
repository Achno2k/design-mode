import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSendRequest } from './parse.ts';
import type { ElementSelection } from './types.ts';

const validSelection = {
  kind: 'element',
  comment: 'too much padding',
  tag: 'article',
  selector: 'main > article',
  classes: ['card'],
  text: 'Pro plan',
  box: { x: 1, y: 2, width: 3, height: 4 },
  styles: { padding: '24px' },
};

const validDrawing = {
  kind: 'drawing',
  comment: 'Align these cards along this curve',
  box: { x: 10, y: 20, width: 80, height: 40 },
  strokes: [
    {
      color: '#ff4d3d',
      width: 4,
      points: [
        { x: 2, y: 3, pressure: 0.5 },
        { x: 20, y: 12, pressure: 0.8 },
      ],
    },
  ],
};

function body(overrides: Record<string, unknown> = {}) {
  return { url: 'http://localhost:3000', paneId: 'w1:p1', selections: [validSelection], ...overrides };
}

function firstElement(parsed: ReturnType<typeof parseSendRequest>): ElementSelection | undefined {
  if (!parsed.ok) return undefined;
  const selection = parsed.value.selections[0];
  return selection?.kind === 'element' ? selection : undefined;
}

test('accepts a well-formed request', () => {
  const parsed = parseSendRequest(body());
  assert.equal(parsed.ok, true);
});

test('accepts a legacy element with no kind and normalizes it', () => {
  const { kind: _kind, ...legacySelection } = validSelection;
  const parsed = parseSendRequest(body({ selections: [legacySelection] }));
  assert.equal(firstElement(parsed)?.kind, 'element');
});

test('accepts a valid freehand drawing', () => {
  const parsed = parseSendRequest(body({ selections: [validDrawing] }));
  assert.equal(parsed.ok, true);
  const drawing = parsed.ok ? parsed.value.selections[0] : undefined;
  assert.equal(drawing?.kind, 'drawing');
  assert.deepEqual(drawing?.kind === 'drawing' ? drawing.strokes : [], validDrawing.strokes);
});

test('rejects a drawing with no strokes', () => {
  const parsed = parseSendRequest(body({ selections: [{ ...validDrawing, strokes: [] }] }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? '' : parsed.error, /strokes/);
});

test('rejects malformed drawing points', () => {
  const strokes = [{ ...validDrawing.strokes[0], points: [{ x: 2, y: 3, pressure: 2 }] }];
  const parsed = parseSendRequest(body({ selections: [{ ...validDrawing, strokes }] }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? '' : parsed.error, /pressure/);
});

test('keeps a non-blank page note', () => {
  const parsed = parseSendRequest(body({ pageNote: 'Audit this flow on mobile too.' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.pageNote, 'Audit this flow on mobile too.');
});

test('accepts a page note with zero selections', () => {
  const parsed = parseSendRequest(body({ pageNote: 'Review the whole page flow.', selections: [] }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.value.selections : null, []);
  assert.equal(parsed.ok && parsed.value.pageNote, 'Review the whole page flow.');
});

test('omits a blank page note', () => {
  const parsed = parseSendRequest(body({ pageNote: '   \n  ' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.pageNote, undefined);
});

test('rejects a request when both selections and page note are empty', () => {
  const parsed = parseSendRequest(body({ selections: [], pageNote: '   ' }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? '' : parsed.error, /at least one selection or a non-empty "pageNote"/);
});

test('names the selection that failed', () => {
  const parsed = parseSendRequest(body({ selections: [validSelection, { kind: 'element', tag: 'div' }] }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? '' : parsed.error, /Selection 2/);
});

test('drops a source that has no line number', () => {
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, source: { file: 'a.tsx' } }] }));
  assert.equal(parsed.ok, true);
  assert.equal(firstElement(parsed)?.source, undefined);
});

test('keeps a complete source', () => {
  const source = { file: 'src/Card.tsx', line: 42, column: 7 };
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, source }] }));
  assert.deepEqual(firstElement(parsed)?.source, source);
});

test('ignores non-string style values rather than failing', () => {
  const styles = { padding: '24px', zIndex: 3 };
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, styles }] }));
  assert.deepEqual(firstElement(parsed)?.styles, { padding: '24px' });
});

test('keeps well-formed element context and drops malformed pieces', () => {
  const context = {
    role: 'button',
    accessibleName: 'Upgrade plan',
    attributes: { type: 'button', 'aria-expanded': 'false', tabIndex: 0 },
    disabled: false,
    nearestHeading: 'Pricing',
  };
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, context }] }));

  assert.deepEqual(firstElement(parsed)?.context, {
    role: 'button',
    accessibleName: 'Upgrade plan',
    attributes: { type: 'button', 'aria-expanded': 'false' },
    disabled: false,
    nearestHeading: 'Pricing',
  });
});

test('drops an empty context rather than keeping noise', () => {
  const context = { role: '  ', attributes: null, disabled: 'nope' };
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, context }] }));
  assert.equal(parsed.ok, true);
  assert.equal(firstElement(parsed)?.context, undefined);
});

test('keeps well-formed live edits', () => {
  const styleChanges = [{ property: 'font-size', from: '14px', to: '18px' }];
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, styleChanges }] }));
  assert.deepEqual(firstElement(parsed)?.styleChanges, styleChanges);
});

test('drops an incomplete live edit rather than failing the whole review', () => {
  const styleChanges = [{ property: 'font-size', from: '14px' }, { property: 'color', from: 'a', to: 'b' }];
  const parsed = parseSendRequest(body({ selections: [{ ...validSelection, styleChanges }] }));
  assert.deepEqual(firstElement(parsed)?.styleChanges, [{ property: 'color', from: 'a', to: 'b' }]);
});
