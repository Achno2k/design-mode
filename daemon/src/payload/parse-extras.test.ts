import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseConsoleErrors,
  parseFrame,
  parsePath,
  parsePseudoStyles,
  parseTriage,
  parseViewport,
} from './parse-extras.ts';

test('triage keeps only known categories and priorities', () => {
  assert.deepEqual(parseTriage({ category: 'bug', priority: 'P1' }), { category: 'bug', priority: 'P1' });
  assert.deepEqual(parseTriage({ category: 'urgent', priority: 'P2' }), { priority: 'P2' });
  assert.equal(parseTriage({ category: 'urgent' }), undefined);
  assert.equal(parseTriage('bug'), undefined);
});

test('viewport needs positive size and finite scroll', () => {
  const viewport = { width: 1440, height: 900, dpr: 2, scrollX: 0, scrollY: 320 };
  assert.deepEqual(parseViewport(viewport), viewport);
  assert.equal(parseViewport({ ...viewport, width: 0 }), undefined);
  assert.equal(parseViewport({ ...viewport, scrollY: Number.NaN }), undefined);
  assert.equal(parseViewport({ ...viewport, dpr: '2' }), undefined);
});

test('console errors drop malformed entries, cap the list, and clamp counts', () => {
  const entry = { level: 'console', message: 'boom', at: 1, pageUrl: 'http://localhost:3000/', count: 0.5 };
  const parsed = parseConsoleErrors([entry, { level: 'warn', message: 'x', at: 1, pageUrl: 'u' }, 'junk']);
  assert.deepEqual(parsed, [{ ...entry, count: 1 }]);

  const flood = Array.from({ length: 150 }, () => entry);
  assert.equal(parseConsoleErrors(flood)?.length, 100);
  assert.equal(parseConsoleErrors([]), undefined);
});

test('console messages and stacks are truncated', () => {
  const long = 'x'.repeat(5_000);
  const [parsed] = parseConsoleErrors([{ level: 'error', message: long, stack: long, at: 1, pageUrl: 'u', count: 1 }]) ?? [];
  assert.equal(parsed?.message.length, 2_000);
  assert.equal(parsed?.stack?.length, 2_000);
});

test('pseudo styles need a known state and at least one declaration', () => {
  const hover = { pseudo: ':hover', selector: '.btn:hover', declarations: { color: 'red' } };
  assert.deepEqual(parsePseudoStyles([hover, { pseudo: ':visited', selector: 'a', declarations: { color: 'b' } }]), [hover]);
  assert.equal(parsePseudoStyles([{ pseudo: ':hover', selector: '.btn', declarations: {} }]), undefined);
});

test('path and frame are optional and shape-checked', () => {
  assert.deepEqual(parsePath(['my-card', '::shadow', 'button']), ['my-card', '::shadow', 'button']);
  assert.equal(parsePath([]), undefined);
  assert.equal(parsePath('main > div'), undefined);
  assert.deepEqual(parseFrame({ selector: 'iframe#preview', url: 'http://localhost:3000/embed' }), {
    selector: 'iframe#preview',
    url: 'http://localhost:3000/embed',
  });
  assert.equal(parseFrame({ selector: 'iframe' }), undefined);
});
