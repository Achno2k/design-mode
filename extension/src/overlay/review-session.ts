import { askBackground, type ReviewSession } from '../lib/messaging.ts';
import type { ReviewPageNote, Selection } from '../lib/protocol.ts';

const SAVE_DELAY_MS = 100;

/** Persist one tab's review while full-page navigations replace its content script. */
export interface ReviewSessionState {
  restore(stored: ReviewSession): string;
  save(picking: boolean): void;
  setPageNote(url: string, note: string, picking: boolean): void;
  pageNote(url: string): string;
  pageNotes(): ReviewPageNote[];
  clearContent(picking: boolean): void;
  end(): void;
}

export function createReviewSessionState(
  selections: Selection[],
  currentUrl: () => string,
  onError: (message: string) => void,
): ReviewSessionState {
  let notes: Record<string, string> = {};
  let saveTimer: number | null = null;
  let hasReportedError = false;

  function restore(stored: ReviewSession): string {
    selections.splice(0, selections.length, ...stored.selections);
    notes = { ...stored.pageNotes };
    return notes[currentUrl()] ?? '';
  }

  function save(picking: boolean): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    void write(picking);
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
      session: { open: true, picking, selections: selections.map(withoutInlineImage), pageNotes: notes },
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
    save(picking);
  }

  function end(): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    void askBackground({ kind: 'clear-review-session' });
  }

  return { restore, save, setPageNote, pageNote, pageNotes, clearContent, end };
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
