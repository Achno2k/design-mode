import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.ts';
import { log } from '../logger.ts';
import { err, ok, type Result } from '../result.ts';
import { moveBlobIntoPick } from './blob-move.ts';
import { cleanExpiredPicks } from './cleanup.ts';
import { isPng } from './png.ts';
import { renderNote, type RenderedSelection } from './render.ts';
import type { Selection, SendRequest } from './types.ts';

export interface WrittenPick {
  pickId: string;
  directory: string;
  notePath: string;
  hasScreenshots: boolean;
}

export interface WritePickOptions {
  picksDirectory?: string;
  cleanup?: typeof cleanExpiredPicks;
  moveBlob?: typeof moveBlobIntoPick;
}

/** Write a review as a private Markdown note plus validated PNG screenshots. */
export async function writePick(
  request: SendRequest,
  now: Date,
  options: WritePickOptions = {},
): Promise<Result<WrittenPick>> {
  const picksDirectory = options.picksDirectory ?? config.picksDir;
  const pickId = buildPickId(now);
  const directory = join(picksDirectory, pickId);

  try {
    await ensurePickDirectory(picksDirectory, directory);
    const rendered = await writeScreenshots(request.selections, directory, picksDirectory, options);
    if (!rendered.ok) return rendered;

    const notePath = join(directory, 'note.md');
    await writeFile(
      notePath,
      renderNote(request.url, rendered.value, request.pageNote, request.pageNotes, request.consoleErrors),
      { encoding: 'utf8', mode: 0o600 },
    );
    await chmod(notePath, 0o600);

    const cleanup = await (options.cleanup ?? cleanExpiredPicks)(picksDirectory, now.getTime());
    if (!cleanup.ok) log.warn(cleanup.error);

    return ok({
      pickId,
      directory,
      notePath,
      hasScreenshots: rendered.value.some((item) => item.screenshotFile !== null),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(`Could not write the review to ${directory}: ${reason}`);
  }
}

async function writeScreenshots(
  selections: Selection[],
  directory: string,
  picksDirectory: string,
  options: WritePickOptions,
): Promise<Result<RenderedSelection[]>> {
  const rendered: RenderedSelection[] = [];
  for (const [index, selection] of selections.entries()) {
    const screenshotFile = await writeScreenshot(
      selection,
      directory,
      picksDirectory,
      index + 1,
      options.moveBlob ?? moveBlobIntoPick,
    );
    if (!screenshotFile.ok) return screenshotFile;
    rendered.push({ selection, screenshotFile: screenshotFile.value });
  }
  return ok(rendered);
}

async function writeScreenshot(
  selection: Selection,
  directory: string,
  picksDirectory: string,
  position: number,
  moveBlob: typeof moveBlobIntoPick,
): Promise<Result<string | null>> {
  const filename = `shot-${position}.png`;
  if (selection.screenshotBlobId !== undefined) {
    return moveBlob(selection.screenshotBlobId, directory, filename, picksDirectory);
  }
  if (selection.screenshot === undefined || selection.screenshot === '') return ok(null);

  const bytes = Buffer.from(selection.screenshot, 'base64');
  if (!isPng(bytes)) return ok(null);
  await writeFile(join(directory, filename), bytes, { mode: 0o600 });
  await chmod(join(directory, filename), 0o600);
  return ok(filename);
}

async function ensurePickDirectory(root: string, directory: string): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
}

function buildPickId(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${stamp}-${randomUUID()}`;
}
