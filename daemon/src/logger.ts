import type { Paint, Rgb } from './terminal/paint.ts';
import { palette } from './terminal/palette.ts';
import { screen, type LineOptions } from './terminal/screen.ts';

/**
 * Daemon logging. On a terminal each line is a timestamp, a coloured mark and
 * the message; anywhere else it keeps the `[nudge]` prefix, so daemon
 * output is still easy to spot in a log file or a busy pane.
 */

type Level = 'info' | 'ready' | 'warn' | 'error';

export type LogOptions = Pick<LineOptions, 'replaceKey'>;

const PREFIX = '[nudge]';

const MARKS: Record<Level, { glyph: string; color: Rgb }> = {
  info: { glyph: '›', color: palette.accent },
  ready: { glyph: '●', color: palette.ok },
  warn: { glyph: '!', color: palette.warn },
  error: { glyph: '✕', color: palette.error },
};

export const log = {
  info(message: string, options?: LogOptions): void {
    write('info', message, options);
  },

  /** Something is up and usable, like the server listening. */
  ready(message: string, options?: LogOptions): void {
    write('ready', message, options);
  },

  warn(message: string, options?: LogOptions): void {
    write('warn', message, options);
  },

  error(message: string, options?: LogOptions): void {
    write('error', message, options);
  },
};

function write(level: Level, message: string, options: LogOptions = {}): void {
  const stream = level === 'warn' || level === 'error' ? 'err' : 'out';
  screen.line(formatLine(level, message, screen.interactive, screen.paint), { ...options, stream });
}

/** One log line as the terminal or the log file should see it. */
export function formatLine(
  level: Level,
  message: string,
  interactive: boolean,
  paint: Paint,
  now: Date = new Date(),
): string {
  if (!interactive) return `${PREFIX} ${message}`;
  const { glyph, color } = MARKS[level];
  const time = paint.fg(palette.muted, now.toTimeString().slice(0, 8));
  const text = level === 'warn' || level === 'error' ? paint.fg(color, message) : message;
  return `  ${time}  ${paint.fg(color, glyph)}  ${text}`;
}
