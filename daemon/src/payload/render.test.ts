import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderNote, renderPrompt } from './render.ts';
import type { DrawingSelection, ElementSelection } from './types.ts';

function selection(overrides: Partial<ElementSelection> = {}): ElementSelection {
  return {
    kind: 'element',
    comment: 'padding is inconsistent',
    tag: 'article',
    selector: 'main > article',
    classes: ['card'],
    text: 'Pro plan',
    box: { x: 410, y: 220, width: 320, height: 186 },
    styles: { padding: '24px 16px' },
    ...overrides,
  };
}

test('leads with the source location when it is known', () => {
  const note = renderNote('http://localhost:3000', [
    { selection: selection({ source: { file: 'src/Card.tsx', line: 42 } }), screenshotFile: null },
  ]);
  assert.match(note, /## 1\. src\/Card\.tsx:42/);
});

test('explains how to find the element when the source is unknown', () => {
  const note = renderNote('http://localhost:3000', [{ selection: selection(), screenshotFile: null }]);
  assert.match(note, /source unknown/);
  assert.match(note, /find the element by its text or classes/);
});

test('renders a non-blank page note right after the intro', () => {
  const note = renderNote(
    'http://localhost:3000',
    [{ selection: selection(), screenshotFile: null }],
    'Check the tablet breakpoint too.',
  );

  assert.match(note, /One review item was added in the browser\.\n\n## Page note\n\n> Check the tablet breakpoint too\./);
});

test('renders a natural intro for a page note with no selections', () => {
  const note = renderNote('http://localhost:3000', [], 'Review the overall information hierarchy.');

  assert.match(note, /A general page note was added in the browser\.\n\n## Page note\n\n> Review the overall information hierarchy\./);
  assert.doesNotMatch(note, /^## 1\./m);
});

test('quotes the comment so it reads as the user speaking', () => {
  const note = renderNote('http://localhost:3000', [{ selection: selection(), screenshotFile: null }]);
  assert.match(note, /^> padding is inconsistent$/m);
});

test('renders available element context without empty noise', () => {
  const note = renderNote('http://localhost:3000', [
    {
      selection: selection({
        context: {
          role: 'button',
          accessibleName: 'Upgrade plan',
          attributes: { type: 'button', disabled: '' },
          disabled: true,
          nearestHeading: 'Pricing',
        },
      }),
      screenshotFile: null,
    },
  ]);

  assert.match(note, /- context: role `button`; accessible name "Upgrade plan"; disabled; nearest heading "Pricing"/);
  assert.match(note, /- attributes: `type="button"`; `disabled`/);
  assert.doesNotMatch(note, /accessible name ""/);
});

test('links a screenshot relative to the note', () => {
  const note = renderNote('http://localhost:3000', [{ selection: selection(), screenshotFile: 'shot-1.png' }]);
  assert.match(note, /!\[selection 1\]\(\.\/shot-1\.png\)/);
});

test('numbers every selection', () => {
  const note = renderNote('http://localhost:3000', [
    { selection: selection(), screenshotFile: null },
    { selection: selection(), screenshotFile: null },
  ]);
  assert.match(note, /## 1\./);
  assert.match(note, /## 2\./);
  assert.match(note, /2 review items were added/);
});

test('identifies every page in a multi-page review', () => {
  const pricing = 'http://localhost:3000/pricing';
  const checkout = 'http://localhost:3000/checkout';
  const note = renderNote(
    checkout,
    [
      { selection: selection({ pageUrl: pricing }), screenshotFile: null },
      { selection: selection({ pageUrl: checkout }), screenshotFile: null },
    ],
    undefined,
    [{ url: checkout, comment: 'Keep the checkout summary visible.' }],
  );

  assert.match(note, /^# Browser review — 2 pages$/m);
  assert.match(note, /2 review items were added across 2 pages/);
  assert.match(note, /## Page note — http:\/\/localhost:3000\/checkout/);
  assert.match(note, /- page: http:\/\/localhost:3000\/pricing/);
  assert.match(note, /- page: http:\/\/localhost:3000\/checkout/);
});

test('summarizes a drawing without dumping sampled points', () => {
  const drawing: DrawingSelection = {
    kind: 'drawing',
    comment: 'Move this group along the marked curve',
    box: { x: 12, y: 18, width: 90, height: 44 },
    strokes: [
      {
        color: '#ff4d3d',
        width: 4,
        points: [
          { x: 3, y: 4, pressure: 0.5 },
          { x: 17.25, y: 12, pressure: 0.7 },
        ],
      },
      { color: '#ff4d3d', width: 4, points: [{ x: 40, y: 20, pressure: 0.5 }] },
    ],
    screenshot: 'unused-by-renderer',
  };

  const note = renderNote('http://localhost:3000', [
    { selection: drawing, screenshotFile: 'shot-1.png' },
  ]);

  assert.match(note, /## 1\. Drawing at \(12, 18\)/);
  assert.match(note, /freehand drawing with 2 strokes and 3 sampled points/);
  assert.match(note, /brushes: `#ff4d3d at 4px`/);
  assert.match(note, /!\[drawing 1\]\(\.\/shot-1\.png\)/);
  assert.doesNotMatch(note, /17\.25/);
  assert.doesNotMatch(note, /pressure/);
});

test('the prompt points at the note rather than inlining it', () => {
  const prompt = renderPrompt('/tmp/herdr-picks/x/note.md', 2, 'http://localhost:3000', true);
  assert.match(prompt, /@\/tmp\/herdr-picks\/x\/note\.md/);
  assert.match(prompt, /2 selections/);
});

test('the prompt describes a general page note when there are no selections', () => {
  const prompt = renderPrompt('/tmp/herdr-picks/x/note.md', 0, 'http://localhost:3000', false);
  assert.match(prompt, /general page note/);
  assert.doesNotMatch(prompt, /0 selections/);
  assert.match(prompt, /address it\./);
});

test('the prompt summarizes a multi-page bundle without listing every URL', () => {
  const prompt = renderPrompt('/tmp/x/note.md', 3, 'http://localhost:3000/checkout', false, 2);
  assert.match(prompt, /3 selections across 2 pages/);
  assert.doesNotMatch(prompt, /on http:\/\/localhost/);
});

test('mentions screenshots only when some were written', () => {
  const withImages = renderPrompt('/tmp/x/note.md', 1, 'http://localhost:3000', true);
  const without = renderPrompt('/tmp/x/note.md', 1, 'http://localhost:3000', false);

  assert.match(withImages, /Screenshots sit next to it/);
  // Promising images that do not exist sends the agent looking for missing files.
  assert.doesNotMatch(without, /Screenshot/);
});

test('renders live edits as a table the agent can apply', () => {
  const note = renderNote('http://localhost:5173', [
    {
      selection: selection({
        styleChanges: [
          { property: 'font-size', from: '14px', to: '18px' },
          { property: 'color', from: 'rgb(26, 18, 6)', to: '#ff0000' },
        ],
      }),
      screenshotFile: null,
    },
  ]);

  assert.match(note, /made these changes live in the browser/);
  assert.match(note, /\| `font-size` \| `14px` \| `18px` \|/);
  assert.match(note, /\| `color` \| `rgb\(26, 18, 6\)` \| `#ff0000` \|/);
});

test('omits the edits table when nothing was changed live', () => {
  const note = renderNote('http://localhost:5173', [{ selection: selection(), screenshotFile: null }]);
  assert.doesNotMatch(note, /made these changes live/);
});
