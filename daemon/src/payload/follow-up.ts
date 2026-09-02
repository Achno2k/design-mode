import { appendFile, readFile } from 'node:fs/promises';

import { err, ok, type Result } from '../result.ts';

const HEADING = /^## Follow-up (\d+)\s*$/gm;

/**
 * Add a reply to the bottom of a review note and return its number.
 *
 * The note is the source of truth for numbering: the daemon may have been
 * restarted since the last reply, and the agent reads the note, not the
 * tracker.
 */
export async function appendFollowUp(notePath: string, comment: string): Promise<Result<number>> {
  let existing: string;
  try {
    existing = await readFile(notePath, 'utf8');
  } catch (cause) {
    return err(`Could not read ${notePath} to add the reply: ${describe(cause)}`);
  }

  const number = countFollowUps(existing) + 1;
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  try {
    await appendFile(notePath, `${separator}## Follow-up ${number}\n\n${comment.trim()}\n`, 'utf8');
    return ok(number);
  } catch (cause) {
    return err(`Could not add the reply to ${notePath}: ${describe(cause)}`);
  }
}

/** How many `## Follow-up N` sections a note already carries. */
export function countFollowUps(note: string): number {
  let highest = 0;
  for (const match of note.matchAll(HEADING)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

/** The line typed into the agent after a reply is appended. */
export function renderFollowUpPrompt(notePath: string, number: number): string {
  return `Browser review follow-up ${number} — read the "## Follow-up ${number}" section at the end of @${notePath} and address it.`;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
