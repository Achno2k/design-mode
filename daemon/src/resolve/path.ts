import { realpath } from 'node:fs/promises';

import { err, ok, type Result } from '../result.ts';

/** Resolve a path to its canonical filesystem spelling. */
export async function canonicalizePath(path: string): Promise<Result<string>> {
  try {
    return ok(await realpath(path));
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(`Could not resolve ${path} on this machine: ${reason}`);
  }
}
