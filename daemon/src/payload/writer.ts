import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';
import { renderNote, type RenderedSelection } from './render.ts';
import type { SendRequest } from './types.ts';

/** Where a review was written, so the caller can point the agent at it. */
export interface WrittenPick {
  pickId: string;
  directory: string;
  notePath: string;
  /** Whether any selection carried an image, so the prompt can say so honestly. */
  hasScreenshots: boolean;
}

/**
 * Write a review to disk as a markdown note plus one PNG per selection.
 *
 * Files rather than a long prompt: the agent reads the note when it is ready
 * and opens the screenshots only if it needs them, which keeps its context
 * clear for the actual work.
 */
export async function writePick(request: SendRequest, now: Date): Promise<Result<WrittenPick>> {
  const pickId = buildPickId(now);
  const directory = join(config.picksDir, pickId);

  try {
    await mkdir(directory, { recursive: true });

    const rendered: RenderedSelection[] = [];
    for (const [index, selection] of request.selections.entries()) {
      const screenshotFile = await writeScreenshot(directory, index + 1, selection.screenshot);
      rendered.push({ selection, screenshotFile });
    }

    const notePath = join(directory, 'note.md');
    await writeFile(
      notePath,
      renderNote(request.url, rendered, request.pageNote, request.pageNotes),
      'utf8',
    );

    return ok({
      pickId,
      directory,
      notePath,
      hasScreenshots: rendered.some((item) => item.screenshotFile !== null),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(`Could not write the review to ${directory}: ${reason}`);
  }
}

/** Returns the filename written, or null when the selection carried no image. */
async function writeScreenshot(
  directory: string,
  position: number,
  base64: string | undefined,
): Promise<string | null> {
  if (base64 === undefined || base64 === '') return null;

  const filename = `shot-${position}.png`;
  await writeFile(join(directory, filename), Buffer.from(base64, 'base64'));
  return filename;
}

/**
 * Sortable, readable, and unique: a second-precision timestamp plus a short
 * random suffix, so two reviews sent in the same second cannot collide.
 */
function buildPickId(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${suffix}`;
}
