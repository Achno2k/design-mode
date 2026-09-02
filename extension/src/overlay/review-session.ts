import { askBackground, type ReviewSession, type SentPick } from '../lib/messaging.ts';
import type { ConsoleEntry, ReviewPageNote, Selection } from '../lib/protocol.ts';

const SAVE_DELAY_MS = 100;

/** Persist one tab's review while full-page navigations replace its content script. */
export interface ReviewSessionState {
  restore(stored: ReviewSession): string;
  /** Resolves once the session is in extension storage; a reload may then follow safely. */
  save(picking: boolean): Promise<void>;
  setPageNote(url: string, note: string, picking: boolean): void;
  pageNote(url: string): string;
  pageNotes(): ReviewPageNote[];
  clearContent(picking: boolean): void;
  end(): void;
  /** The last review sent from this tab, followed until it is done or replaced. */
  lastPick(): SentPick | null;
  setLastPick(pick: SentPick | null, picking: boolean): Promise<void>;
  isConsoleCapture(): boolean;
  setConsoleCapture(on: boolean, picking: boolean): void;
  consoleErrors(): ConsoleEntry[];
  setConsoleErrors(entries: ConsoleEntry[], picking: boolean): void;
}

export function createReviewSessionState(
  selections: Selection[],
  currentUrl: () => string,
  onError: (message: string) => void,
): ReviewSessionState {
  let notes: Record<string, string> = {};
  let sentPick: SentPick | null = null;
  let consoleCapture = false;
  let consoleEntries: ConsoleEntry[] = [];
  let saveTimer: number | null = null;
  let hasReportedError = false;

  function restore(stored: ReviewSession): string {
    selections.splice(0, selections.length, ...stored.selections);
    notes = { ...stored.pageNotes };
    sentPick = stored.lastPick ?? null;
    consoleCapture = stored.consoleCapture ?? false;
    consoleEntries = [...(stored.consoleErrors ?? [])];
    return notes[currentUrl()] ?? '';
  }

  function save(picking: boolean): Promise<void> {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    return write(picking);
  }

  function saveAfterTyping(picking: boolean): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void write(picking);
    }, SAVE_DELAY_MS);
  }

  async function write(picking: boolean): Promise<void> {
    const answer = await askBackground({
      kind: 'save-review-session',
      session: {
        open: true,
        picking,
        selections: selections.map(withoutInlineImage),
        pageNotes: notes,
        ...(sentPick === null ? {} : { lastPick: sentPick }),
        consoleCapture,
        consoleErrors: consoleEntries,
      },
    });
    if (!answer.ok && !hasReportedError) {
      hasReportedError = true;
      onError(answer.error);
    }
  }

  function setPageNote(url: string, note: string, picking: boolean): void {
    if (note === '') delete notes[url];
    else notes[url] = note;
    saveAfterTyping(picking);
  }

  function pageNote(url: string): string {
    return notes[url] ?? '';
  }

  function pageNotes(): ReviewPageNote[] {
    return Object.entries(notes).map(([url, comment]) => ({ url, comment }));
  }

  function clearContent(picking: boolean): void {
    selections.length = 0;
    notes = {};
    consoleEntries = [];
    save(picking);
  }

  function end(): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    void askBackground({ kind: 'clear-review-session' });
  }

  return {
    restore,
    save,
    setPageNote,
    pageNote,
    pageNotes,
    clearContent,
    end,
    lastPick: () => sentPick,
    setLastPick(pick, picking) {
      sentPick = pick;
      return save(picking);
    },
    isConsoleCapture: () => consoleCapture,
    setConsoleCapture(on, picking) {
      consoleCapture = on;
      save(picking);
    },
    consoleErrors: () => consoleEntries,
    setConsoleErrors(entries, picking) {
      consoleEntries = entries;
      saveAfterTyping(picking);
    },
  };
}

/** Inline fallback images must never consume Chrome's small session-storage quota. */
function withoutInlineImage(selection: Selection): Selection {
  if (selection.kind === 'element') {
    const { screenshot: _screenshot, ...durable } = selection;
    return durable;
  }
  const { screenshot: _screenshot, ...durable } = selection;
  return durable;
}
