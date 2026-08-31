import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';

/** Persist uploaded screenshot bytes and return their opaque id. */
export async function writeBlob(
  bytes: Buffer,
  picksDirectory: string = config.picksDir,
): Promise<Result<string>> {
  const blobId = randomUUID();
  const directory = join(picksDirectory, '.blobs');

  try {
    await ensurePrivateDirectory(picksDirectory);
    await ensurePrivateDirectory(directory);
    await writeFile(join(directory, `${blobId}.png`), bytes, { mode: 0o600, flag: 'wx' });
    return ok(blobId);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(`Could not store that screenshot: ${reason}`);
  }
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}
