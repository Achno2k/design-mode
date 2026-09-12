import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';

import { createPaint } from './paint.ts';
import { renderPairingCard } from './pairing-card.ts';

const TOKEN = '8b5296f8ea3180a2397bf57e6384e9ea';

test('boxes the card with every row the same width', () => {
  const rows = renderPairingCard(TOKEN, createPaint('truecolor'), 120, '/opt/nudge-mode/extension/dist').map(stripVTControlCharacters);
  const widths = new Set(rows.map((row) => row.length));

  assert.equal(widths.size, 1);
  assert.match(rows[0] ?? '', /^ {2}╭─ pair the extension ─+╮$/);
  assert.match(rows.at(-1) ?? '', /^ {2}╰─+╯$/);
});

test('keeps the code as one unbroken word so a double-click selects it', () => {
  const rows = renderPairingCard(TOKEN, createPaint('truecolor'), 120, '/opt/nudge-mode/extension/dist').map(stripVTControlCharacters);
  assert.ok(rows.some((row) => row.includes(` ${TOKEN} `)));
});

test('drops the box on a terminal too narrow for it', () => {
  const rows = renderPairingCard(TOKEN, createPaint('none'), 40, '/opt/nudge-mode/extension/dist');
  assert.ok(rows.every((row) => !/[╭╮╰╯│]/.test(row)));
  assert.ok(rows.some((row) => row.includes(TOKEN)));
  assert.ok(rows.some((row) => row.includes('/opt/nudge-mode/extension/dist')));
});
