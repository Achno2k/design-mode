/**
 * A success value or a human-readable failure.
 *
 * Every function that touches the outside world (subprocesses, the filesystem,
 * the network) returns one of these instead of throwing. Callers then have to
 * acknowledge the failure path, and the `error` string is written for the
 * person staring at the browser — not for a stack trace.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Wrap a successful value. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Wrap a failure. `message` should be a sentence the user can act on. */
export function err(message: string): Result<never> {
  return { ok: false, error: message };
}
