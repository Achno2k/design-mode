/**
 * Colour for daemon output, hand-rolled: the daemon has no runtime
 * dependencies, and truecolour SGR with a 256-colour fallback is a few lines.
 * Node's getColorDepth already honours NO_COLOR, FORCE_COLOR, TERM and
 * COLORTERM, so the stream decides the depth and this file only encodes.
 */

export type Rgb = readonly [number, number, number];

export type ColorDepth = 'none' | 'ansi256' | 'truecolor';

export type Paint = {
  fg(color: Rgb, text: string): string;
  bold(text: string): string;
};

/** How much colour a stream takes. Anything short of 256 colours gets none. */
export function colorDepthOf(stream: { isTTY?: boolean; getColorDepth?(): number }): ColorDepth {
  if (!stream.isTTY) return 'none';
  const depth = stream.getColorDepth?.() ?? 1;
  if (depth >= 24) return 'truecolor';
  return depth >= 8 ? 'ansi256' : 'none';
}

/** Styling functions for one colour depth. At 'none' they return the text untouched. */
export function createPaint(depth: ColorDepth): Paint {
  if (depth === 'none') return { fg: (_color, text) => text, bold: (text) => text };
  return {
    fg: (color, text) => `${foreground(color, depth)}${text}\x1b[39m`,
    bold: (text) => `\x1b[1m${text}\x1b[22m`,
  };
}

/** Each character of text coloured by its position along the gradient stops. */
export function gradientText(text: string, paint: Paint, stops: readonly [Rgb, ...Rgb[]]): string {
  const chars = [...text];
  const last = Math.max(chars.length - 1, 1);
  return chars
    .map((char, index) => (char === ' ' ? char : paint.fg(gradientAt(stops, index / last), char)))
    .join('');
}

/** The colour at t (0 to 1) along evenly spaced stops. */
export function gradientAt(stops: readonly [Rgb, ...Rgb[]], t: number): Rgb {
  const scaled = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), Math.max(stops.length - 2, 0));
  const from = stops[index] ?? stops[0];
  const to = stops[index + 1] ?? from;
  return mix(from, to, scaled - index);
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  const channel = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return [channel(from[0], to[0]), channel(from[1], to[1]), channel(from[2], to[2])];
}

function foreground([red, green, blue]: Rgb, depth: 'ansi256' | 'truecolor'): string {
  return depth === 'truecolor'
    ? `\x1b[38;2;${red};${green};${blue}m`
    : `\x1b[38;5;${toAnsi256(red, green, blue)}m`;
}

/** The nearest xterm-256 index: the greyscale ramp for greys, the 6x6x6 cube otherwise. */
function toAnsi256(red: number, green: number, blue: number): number {
  if (red === green && green === blue) {
    if (red < 8) return 16;
    if (red > 248) return 231;
    return Math.round(((red - 8) / 247) * 24) + 232;
  }
  const level = (channel: number): number => Math.round((channel / 255) * 5);
  return 16 + 36 * level(red) + 6 * level(green) + level(blue);
}
