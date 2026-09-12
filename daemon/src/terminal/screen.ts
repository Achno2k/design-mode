import { stripVTControlCharacters } from 'node:util';

import { colorDepthOf, createPaint, type Paint } from './paint.ts';

/**
 * The one writer for daemon output. It does two jobs a bare console.log cannot:
 * holding lines back while the banner redraws its own rows, and overwriting the
 * previous line in place when the same event repeats, so a watch-mode rebuild
 * updates one line instead of printing a new one per save.
 */

export type TerminalStream = {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(chunk: string): boolean;
  getColorDepth?(): number;
};

export type LineOptions = {
  stream?: 'out' | 'err';
  /** Overwrite the previous line if it was written with the same key. */
  replaceKey?: string;
};

export type Screen = {
  /** A person is watching a real terminal. Otherwise output is plain lines for a log file. */
  readonly interactive: boolean;
  readonly paint: Paint;
  columns(): number;
  line(text: string, options?: LineOptions): void;
  /** Write straight to stdout, past any hold. For the banner's own redraws. */
  raw(text: string): void;
  /** Queue lines until the returned release is called, or the process exits. */
  hold(): () => void;
  /** Start from a blank screen, keeping what was on it in scrollback. */
  clear(): void;
  hideCursor(): void;
  showCursor(): void;
};

type Queued = { text: string; options: LineOptions };

const CLEAR_PREVIOUS_LINE = '\x1b[1A\r\x1b[2K';
const CLEAR_SCREEN = '\x1b[H\x1b[J';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const FALLBACK_COLUMNS = 100;

/** A screen over the given streams. NUDGE_PLAIN=1 forces plain output. */
export function createScreen(
  out: TerminalStream,
  err: TerminalStream,
  env: NodeJS.ProcessEnv = process.env,
): Screen {
  const interactive =
    Boolean(out.isTTY) && !['', 'dumb'].includes(env.TERM ?? '') && env.NUDGE_PLAIN !== '1';
  const paint = createPaint(interactive ? colorDepthOf(out) : 'none');
  const columns = (): number => out.columns || FALLBACK_COLUMNS;
  const restoreCursor = (): void => void out.write(SHOW_CURSOR);
  let queue: Queued[] | undefined;
  let last: { key?: string; fits: boolean } = { fits: false };

  const emit = ({ text, options }: Queued): void => {
    const fits = stripVTControlCharacters(text).length < columns();
    const repeats = options.replaceKey !== undefined && options.replaceKey === last.key;
    const replace = interactive && repeats && fits && last.fits;
    (options.stream === 'err' ? err : out).write(`${replace ? CLEAR_PREVIOUS_LINE : ''}${text}\n`);
    last = { key: options.replaceKey, fits };
  };

  const flush = (): void => {
    const lines = queue ?? [];
    queue = undefined;
    lines.forEach(emit);
  };

  return {
    interactive,
    paint,
    columns,
    line(text, options = {}) {
      if (queue) queue.push({ text, options });
      else emit({ text, options });
    },
    raw(text) {
      out.write(text);
      last = { fits: false };
    },
    hold() {
      queue ??= [];
      // An early exit (a taken port, Ctrl+C mid-banner) must still show its message.
      process.once('exit', flush);
      return () => {
        process.off('exit', flush);
        flush();
      };
    },
    clear() {
      if (!interactive) return;
      // Scroll the screen into scrollback before clearing it, the way Vite does,
      // so npm's script echo goes away without erasing the user's history.
      out.write(`${'\n'.repeat(Math.max((out.rows ?? 0) - 1, 0))}${CLEAR_SCREEN}`);
      last = { fits: false };
    },
    hideCursor() {
      if (!interactive) return;
      out.write(HIDE_CURSOR);
      process.once('exit', restoreCursor);
    },
    showCursor() {
      if (!interactive) return;
      process.off('exit', restoreCursor);
      restoreCursor();
    },
  };
}

/** The daemon's own terminal, shared by the logger and the start-up screen. */
export const screen = createScreen(process.stdout, process.stderr);
