import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { err, ok, type Result } from '../result.ts';

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Read the persistent pairing token, creating a private one on first use. */
export async function readOrCreateToken(
  tokenPath: string = join(homedir(), '.nudge', 'token'),
): Promise<Result<string>> {
  const directory = dirname(tokenPath);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  } catch (cause) {
    return tokenError(tokenPath, cause);
  }

  const existing = await readToken(tokenPath);
  if (!existing.ok) return existing;
  if (existing.value !== null) return ok(existing.value);

  const token = randomBytes(16).toString('hex');
  try {
    await writeFile(tokenPath, `${token}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(tokenPath, 0o600);
    return ok(token);
  } catch (cause) {
    if (!isFileExistsError(cause)) return tokenError(tokenPath, cause);
    const raced = await readToken(tokenPath);
    if (!raced.ok) return raced;
    return raced.value === null
      ? err(`The pairing code at ${tokenPath} disappeared while it was being created. Restart the daemon.`)
      : ok(raced.value);
  }
}

async function readToken(tokenPath: string): Promise<Result<string | null>> {
  try {
    const token = (await readFile(tokenPath, 'utf8')).trim();
    if (!TOKEN_PATTERN.test(token)) {
      return err(`The pairing code at ${tokenPath} is invalid. Delete it and restart the daemon.`);
    }
    await chmod(tokenPath, 0o600);
    return ok(token);
  } catch (cause) {
    return isMissingFileError(cause) ? ok(null) : tokenError(tokenPath, cause);
  }
}

function tokenError(tokenPath: string, cause: unknown): Result<never> {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return err(`Could not read or create the pairing code at ${tokenPath}: ${reason}`);
}

function isMissingFileError(cause: unknown): boolean {
  return isNodeError(cause) && cause.code === 'ENOENT';
}

function isFileExistsError(cause: unknown): boolean {
  return isNodeError(cause) && cause.code === 'EEXIST';
}

function isNodeError(cause: unknown): cause is NodeJS.ErrnoException {
  return cause instanceof Error;
}
