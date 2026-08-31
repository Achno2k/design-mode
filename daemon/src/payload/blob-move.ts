import { chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';

const BLOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Move a known blob into a pick, or return null when the id is unknown. */
export async function moveBlobIntoPick(
  blobId: string,
  pickDirectory: string,
  filename: string,
  picksDirectory: string = config.picksDir,
): Promise<Result<string | null>> {
  if (!BLOB_ID_PATTERN.test(blobId)) return ok(null);

  try {
    const destination = join(pickDirectory, filename);
    await rename(join(picksDirectory, '.blobs', `${blobId}.png`), destination);
    await chmod(destination, 0o600);
    return ok(filename);
  } catch (cause) {
    if (isMissingFileError(cause)) return ok(null);
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(`Could not attach screenshot ${blobId}: ${reason}`);
  }
}

function isMissingFileError(cause: unknown): boolean {
  return cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT';
}
