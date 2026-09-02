import { isFiniteNumber, isRecord, readString, readStringArray, readStringMap } from './parse-primitives.ts';
import type {
  ConsoleEntry,
  FrameRef,
  ItemCategory,
  ItemPriority,
  ItemTriage,
  PseudoStyle,
  Viewport,
} from './types.ts';

/**
 * Optional review context added in protocol 3.
 *
 * None of this is required to act on a review, so a malformed piece is dropped
 * rather than failing the whole send. Lists are capped: they come from a web
 * page and would otherwise let one bad loop flood the note.
 */

const MAX_CONSOLE_ENTRIES = 100;
const MAX_CONSOLE_MESSAGE_LENGTH = 2_000;
const MAX_PSEUDO_STYLES = 20;
const MAX_PATH_SEGMENTS = 64;

const CATEGORIES: ItemCategory[] = ['bug', 'polish', 'question'];
const PRIORITIES: ItemPriority[] = ['P1', 'P2', 'P3'];
const PSEUDO_STATES: PseudoStyle['pseudo'][] = [':hover', ':focus', ':focus-visible', ':active'];
const CONSOLE_LEVELS: ConsoleEntry['level'][] = ['error', 'rejection', 'console'];

export function parseTriage(raw: unknown): ItemTriage | undefined {
  if (!isRecord(raw)) return undefined;

  const category = CATEGORIES.find((value) => value === raw.category);
  const priority = PRIORITIES.find((value) => value === raw.priority);
  if (category === undefined && priority === undefined) return undefined;

  return {
    ...(category === undefined ? {} : { category }),
    ...(priority === undefined ? {} : { priority }),
  };
}

export function parseViewport(raw: unknown): Viewport | undefined {
  if (!isRecord(raw)) return undefined;

  const { width, height, dpr, scrollX, scrollY } = raw;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || !isFiniteNumber(dpr)) return undefined;
  if (!isFiniteNumber(scrollX) || !isFiniteNumber(scrollY)) return undefined;
  if (width <= 0 || height <= 0 || dpr <= 0) return undefined;
  return { width, height, dpr, scrollX, scrollY };
}

export function parseConsoleErrors(raw: unknown): ConsoleEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const entries = raw.slice(0, MAX_CONSOLE_ENTRIES).flatMap((entry) => {
    if (!isRecord(entry)) return [];

    const level = CONSOLE_LEVELS.find((value) => value === entry.level);
    const message = readString(entry.message);
    const pageUrl = readString(entry.pageUrl);
    if (level === undefined || message === null || pageUrl === null) return [];
    if (!isFiniteNumber(entry.at)) return [];

    const stack = readString(entry.stack);
    const count = isFiniteNumber(entry.count) && entry.count >= 1 ? Math.floor(entry.count) : 1;
    return [
      {
        level,
        message: message.slice(0, MAX_CONSOLE_MESSAGE_LENGTH),
        ...(stack === null ? {} : { stack: stack.slice(0, MAX_CONSOLE_MESSAGE_LENGTH) }),
        at: entry.at,
        pageUrl,
        count,
      },
    ];
  });

  return entries.length === 0 ? undefined : entries;
}

export function parsePseudoStyles(raw: unknown): PseudoStyle[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const styles = raw.slice(0, MAX_PSEUDO_STYLES).flatMap((entry) => {
    if (!isRecord(entry)) return [];

    const pseudo = PSEUDO_STATES.find((value) => value === entry.pseudo);
    const selector = readString(entry.selector);
    const declarations = readStringMap(entry.declarations);
    if (pseudo === undefined || selector === null || Object.keys(declarations).length === 0) return [];

    const sheet = readString(entry.sheet);
    return [{ pseudo, selector, ...(sheet === null ? {} : { sheet }), declarations }];
  });

  return styles.length === 0 ? undefined : styles;
}

export function parsePath(raw: unknown): string[] | undefined {
  const segments = readStringArray(raw).filter((segment) => segment.trim() !== '');
  if (segments.length === 0 || segments.length > MAX_PATH_SEGMENTS) return undefined;
  return segments;
}

export function parseFrame(raw: unknown): FrameRef | undefined {
  if (!isRecord(raw)) return undefined;

  const selector = readString(raw.selector);
  const url = readString(raw.url);
  return selector === null || url === null ? undefined : { selector, url };
}
