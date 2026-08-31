import type { Dirent } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';

/** Delete expired picks and uploaded blobs without touching recent data. */
export async function cleanExpiredPicks(
  picksDirectory: string = config.picksDir,
  nowMs: number = Date.now(),
  ttlMs: number = config.pickTtlMs,
): Promise<Result<void>> {
  try {
    const entries = await readEntries(picksDirectory);
    if (entries === null) return ok(undefined);

    for (const entry of entries) {
      if (entry.name === '.blobs') continue;
      if (!entry.isDirectory()) continue;
      await removeWhenExpired(join(picksDirectory, entry.name), nowMs, ttlMs, true);
    }

    const blobDirectory = join(picksDirectory, '.blobs');
    const blobs = await readEntries(blobDirectory);
    for (const blob of blobs ?? []) {
      if (!blob.isFile()) continue;
      await removeWhenExpired(join(blobDirectory, blob.name), nowMs, ttlMs, false);
    }
    return ok(undefined);
  } catch (cause) {
    return err(`Could not remove expired browser reviews: ${describe(cause)}`);
  }
}

async function readEntries(directory: string): Promise<Dirent[] | null> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    if (isMissingFileError(cause)) return null;
    throw cause;
  }
}

async function removeWhenExpired(
  path: string,
  nowMs: number,
  ttlMs: number,
  recursive: boolean,
): Promise<void> {
  const details = await stat(path);
  if (nowMs - details.mtimeMs <= ttlMs) return;
  await rm(path, { recursive, force: true });
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isMissingFileError(cause: unknown): boolean {
  return cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT';
}
