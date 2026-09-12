import { gradientAt, type Paint } from './paint.ts';
import { palette } from './palette.ts';

/**
 * The NUDGE wordmark, drawn here rather than pulled from a figlet font:
 * five letters at five rows is less code than a dependency, and every
 * glyph is exactly GLYPH_WIDTH columns so each letter can animate on its own.
 * The state lives here, apart from the timers, so any point in the sequence
 * renders as a whole frame and a test can pin the randomness.
 */

export const WORDMARK_ROWS = 5;
const GLYPH_WIDTH = 5;
const LETTER_GAP = 1;
const WORD_GAP = 3;
const TEXT = 'NUDGE';

const GLYPHS: Record<string, readonly string[]> = {
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  E: ['█████', '█    ', '████ ', '█    ', '█████'],
  S: [' ████', '█    ', ' ███ ', '    █', '████ '],
  I: ['█████', '  █  ', '  █  ', '  █  ', '█████'],
  G: [' ████', '█    ', '█  ██', '█   █', ' ████'],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
  M: ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
};

/** Light to heavy, so a run of them reads as a letter resolving rather than as noise. */
const GLITCH_SHADES = ['░', '▒', '▓', '█'];

type Letter = { glyph: readonly string[]; column: number; rows: string[]; settled: boolean };

export type Wordmark = {
  readonly letters: number;
  readonly width: number;
  /** Letter index as random block shades, jittered a column left or right. */
  glitch(index: number): void;
  /** Letter index in its real shape, drawn in the gradient. */
  settle(index: number): void;
  /** Letter index drawn entirely in one shade, for the flicker. */
  shade(index: number, shade: string): void;
  /** Up to count settled letters, in random order. */
  pickSettled(count: number): number[];
  render(paint: Paint): string[];
};

export function createWordmark(random: () => number = Math.random): Wordmark {
  const letters = layout();
  const lastLetter = letters.at(-1);
  const width = lastLetter ? lastLetter.column + GLYPH_WIDTH : 0;
  const update = (index: number, rows: string[], settled: boolean): void => {
    const letter = letters[index];
    if (letter) Object.assign(letter, { rows, settled });
  };

  return {
    letters: letters.length,
    width,
    glitch: (index) => update(index, glitchRows(letters[index]?.glyph ?? [], random), false),
    settle: (index) => update(index, [...(letters[index]?.glyph ?? [])], true),
    shade: (index, shade) =>
      update(index, (letters[index]?.glyph ?? []).map((row) => row.replace(/[^ ]/g, shade)), false),
    pickSettled(count) {
      const settled = letters.flatMap((letter, index) => (letter.settled ? [index] : []));
      return settled
        .map((index) => ({ index, order: random() }))
        .sort((a, b) => a.order - b.order)
        .slice(0, count)
        .map(({ index }) => index);
    },
    render: (paint) => renderRows(letters, width, paint),
  };
}

function layout(): Letter[] {
  const letters: Letter[] = [];
  let column = 0;
  for (const char of TEXT) {
    if (char === ' ') {
      column += WORD_GAP - LETTER_GAP;
      continue;
    }
    const glyph = GLYPHS[char] ?? blankRows();
    letters.push({ glyph, column, rows: blankRows(), settled: false });
    column += GLYPH_WIDTH + LETTER_GAP;
  }
  return letters;
}

function blankRows(): string[] {
  return Array.from({ length: WORDMARK_ROWS }, () => ' '.repeat(GLYPH_WIDTH));
}

function glitchRows(glyph: readonly string[], random: () => number): string[] {
  const jitter = Math.floor(random() * 3) - 1;
  return glyph.map((row) => {
    const cells = Array.from({ length: GLYPH_WIDTH }, () => ' ');
    [...row].forEach((cell, column) => {
      const at = column + jitter;
      if (cell === ' ' || at < 0 || at >= GLYPH_WIDTH) return;
      cells[at] = GLITCH_SHADES[Math.floor(random() * GLITCH_SHADES.length)] ?? '█';
    });
    return cells.join('');
  });
}

/** Settled letters take the gradient by column, so it runs smoothly across the word; the rest are dim. */
function renderRows(letters: readonly Letter[], width: number, paint: Paint): string[] {
  return Array.from({ length: WORDMARK_ROWS }, (_, row) => {
    let line = '';
    let cursor = 0;
    for (const letter of letters) {
      line += ' '.repeat(letter.column - cursor);
      [...(letter.rows[row] ?? '')].forEach((cell, offset) => {
        if (cell === ' ') line += cell;
        else if (!letter.settled) line += paint.fg(palette.muted, cell);
        else line += paint.bold(paint.fg(gradientAt(palette.gradient, (letter.column + offset) / (width - 1)), cell));
      });
      cursor = letter.column + GLYPH_WIDTH;
    }
    return line;
  });
}
