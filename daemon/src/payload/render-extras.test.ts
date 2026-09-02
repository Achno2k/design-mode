import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  renderAuthoredCell,
  renderConsoleErrors,
  renderPseudoStyleFacts,
  renderTriage,
  renderViewportFact,
} from './render-extras.ts';

test('triage renders as a bracketed heading prefix', () => {
  assert.equal(renderTriage({ category: 'bug', priority: 'P1' }), '[bug · P1] ');
  assert.equal(renderTriage({ priority: 'P3' }), '[P3] ');
  assert.equal(renderTriage(undefined), '');
  assert.equal(renderTriage({}), '');
});

test('viewport mentions scroll only when scrolled', () => {
  assert.equal(renderViewportFact({ width: 1440, height: 900, dpr: 2, scrollX: 0, scrollY: 0 }), '- viewport: 1440x900 @2x');
  assert.equal(
    renderViewportFact({ width: 390, height: 844, dpr: 3, scrollX: 0, scrollY: 320 }),
    '- viewport: 390x844 @3x, scrolled to (0, 320)',
  );
});

test('console errors are listed oldest first with repeat counts', () => {
  const lines = renderConsoleErrors([
    { level: 'console', message: 'later', at: 20, pageUrl: 'http://localhost:3000/b', count: 3 },
    { level: 'rejection', message: 'earlier', stack: 'earlier\n  at a.js:1', at: 10, pageUrl: 'http://localhost:3000/a', count: 1 },
  ]).join('\n');

  assert.match(lines, /^## Console errors \(2\)/);
  assert.ok(lines.indexOf('earlier') < lines.indexOf('later'));
  assert.match(lines, /- unhandled rejection on http:\/\/localhost:3000\/a/);
  assert.match(lines, /- console\.error \(×3\) on http:\/\/localhost:3000\/b/);
  assert.match(lines, /<summary>stack<\/summary>/);
  assert.deepEqual(renderConsoleErrors([]), []);
});

test('pseudo styles render one line per state', () => {
  const [line] = renderPseudoStyleFacts([
    { pseudo: ':hover', selector: '.btn:hover', sheet: 'app.css', declarations: { 'background-color': '#333', color: '#fff' } },
  ]);
  assert.equal(line, '- :hover (`.btn:hover` in app.css): background-color: #333; color: #fff');
});

test('authored cell prefers class names and names the sheet', () => {
  assert.equal(renderAuthoredCell({ property: 'padding', from: '16px', to: '24px' }), '');
  assert.equal(
    renderAuthoredCell({ property: 'padding', from: '16px', to: '24px', fromAuthored: '1rem', authoredBy: { selector: '.p-4', sheet: 'tailwind.css', classes: ['p-4'] } }),
    '`1rem` (.p-4, tailwind.css)',
  );
  assert.equal(
    renderAuthoredCell({ property: 'gap', from: '8px', to: '12px', fromAuthored: 'var(--space-2)', authoredBy: { selector: '.grid > .row' } }),
    '`var(--space-2)` (`.grid > .row`)',
  );
});
