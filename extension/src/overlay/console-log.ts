import { CONSOLE_EVENT, type ConsoleHookEntry } from '../inspect/console-hook.ts';
import type { ConsoleEntry } from '../lib/protocol.ts';

/**
 * Collect what the page's console hook reports, ready to send with a review.
 *
 * The hook lives in the page's own world and can only hand values back as a
 * JSON string on a `CustomEvent`, so everything arriving here is untrusted and
 * validated before it is kept.
 */

/** Enough to show a pattern; a page in a render loop must not fill the note. */
const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 2_000;

export interface ConsoleLog {
  /** Listen, continuing from the errors a previous page already collected. */
  start(initial?: ConsoleEntry[]): void;
  stop(): void;
  entries(): ConsoleEntry[];
  clear(): void;
}

export function createConsoleLog(onChange: (entries: ConsoleEntry[]) => void): ConsoleLog {
  let entries: ConsoleEntry[] = [];
  let listening = false;

  function onConsoleEvent(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== 'string') return;

    const entry = readEntry(detail);
    if (entry === null) return;

    append(entry);
    onChange(entries);
  }

  /**
   * A message repeated back to back is one entry with a count. React logs the
   * same warning on every render, and fifty copies of it help nobody.
   */
  function append(entry: ConsoleEntry): void {
    const last = entries[entries.length - 1];
    if (last !== undefined && last.level === entry.level && last.message === entry.message) {
      last.count += 1;
      return;
    }

    entries.push(entry);
    // The newest errors are the ones the user just provoked, so the oldest go.
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  }

  return {
    start(initial = []) {
      entries = [...initial];
      if (listening) return;
      listening = true;
      document.addEventListener(CONSOLE_EVENT, onConsoleEvent);
    },

    stop() {
      if (!listening) return;
      listening = false;
      document.removeEventListener(CONSOLE_EVENT, onConsoleEvent);
    },

    entries: () => entries,

    clear() {
      entries = [];
    },
  };
}

/** How many errors happened, counting the ones folded into a repeat. */
export function countConsoleEntries(entries: ConsoleEntry[]): number {
  return entries.reduce((total, entry) => total + entry.count, 0);
}

function readEntry(detail: string): ConsoleEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(detail);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const entry = raw as Partial<ConsoleHookEntry>;
  if (entry.level !== 'error' && entry.level !== 'rejection' && entry.level !== 'console') return null;
  if (typeof entry.message !== 'string' || entry.message === '') return null;

  return {
    level: entry.level,
    message: entry.message.slice(0, MAX_MESSAGE_LENGTH),
    ...(typeof entry.stack === 'string' ? { stack: entry.stack.slice(0, MAX_MESSAGE_LENGTH) } : {}),
    // The page's clock and URL are its own claim; the overlay's are the truth.
    at: Date.now(),
    pageUrl: window.location.href,
    count: 1,
  };
}
