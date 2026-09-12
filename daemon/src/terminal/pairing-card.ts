import { stripVTControlCharacters } from 'node:util';

import { gradientText, type Paint } from './paint.ts';
import { palette } from './palette.ts';

const MARGIN = '  ';
const PADDING = 3;
const TITLE = 'pair the extension';

/**
 * The pairing code, the folder Chrome needs, and the two steps that use them,
 * boxed where the terminal is wide enough and bare where it is not. The code
 * and the path each stay one unbroken word so a double-click selects all of
 * it; grouping the code would paste spaces into the popup.
 */
export function renderPairingCard(
  token: string,
  paint: Paint,
  columns: number,
  extensionDir: string,
): string[] {
  const body = cardBody(token, paint, extensionDir);
  const inner = Math.max(...body.map(visibleWidth)) + PADDING * 2;
  if (MARGIN.length + inner + 2 > columns) return body.map((row) => MARGIN + row);
  return frame(body, inner, paint);
}

function cardBody(token: string, paint: Paint, extensionDir: string): string[] {
  const muted = (text: string): string => paint.fg(palette.muted, text);
  const step = (label: string): string => paint.bold(paint.fg(palette.accent, label));
  return [
    '',
    muted('pairing code'),
    paint.bold(gradientText(token, paint, palette.gradient)),
    '',
    `${step('1')}  Load the extension in Chrome`,
    `   ${paint.fg(palette.text, extensionDir)}`,
    `   ${muted('Load unpacked that folder in chrome://extensions')}`,
    `${step('2')}  Paste the code into the extension popup`,
    '',
  ];
}

function frame(body: string[], inner: number, paint: Paint): string[] {
  const border = (text: string): string => paint.fg(palette.border, text);
  const title = ` ${paint.fg(palette.accent, TITLE)} `;
  const top = border('╭─') + title + border(`${'─'.repeat(inner - TITLE.length - 3)}╮`);
  const rows = body.map((row) => {
    const fill = ' '.repeat(inner - PADDING - visibleWidth(row));
    return `${border('│')}${' '.repeat(PADDING)}${row}${fill}${border('│')}`;
  });
  const bottom = border(`╰${'─'.repeat(inner)}╯`);
  return [top, ...rows, bottom].map((row) => MARGIN + row);
}

function visibleWidth(text: string): number {
  return stripVTControlCharacters(text).length;
}
