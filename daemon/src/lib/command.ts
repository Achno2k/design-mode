import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';

const execFileAsync = promisify(execFile);

/**
 * Run an external command and return its stdout.
 *
 * `execFile` is used rather than `exec` so arguments are passed as an array and
 * never go through a shell — no quoting rules, no injection surface from URLs
 * or pane ids that originate in the browser.
 */
export async function runCommand(
  binary: string,
  args: string[],
  timeoutMs: number = config.commandTimeoutMs,
): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return ok(stdout);
  } catch (cause) {
    return err(describeFailure(binary, cause));
  }
}

/**
 * Some tools use a non-zero exit code to mean "nothing matched" rather than
 * "something broke" — `lsof` returns 1 when no process holds the port. This
 * variant treats that as an empty result instead of an error.
 */
export async function runCommandAllowingEmpty(
  binary: string,
  args: string[],
  timeoutMs: number = config.commandTimeoutMs,
): Promise<Result<string>> {
  const result = await runCommand(binary, args, timeoutMs);
  if (result.ok) return result;

  return isEmptyExit(binary, result.error) ? ok('') : result;
}

function isEmptyExit(binary: string, error: string): boolean {
  return error === exitCodeMessage(binary, 1);
}

function describeFailure(binary: string, cause: unknown): string {
  if (!isExecError(cause)) {
    return `Running "${binary}" failed for an unknown reason.`;
  }
  if (cause.code === 'ENOENT') {
    return `Could not find "${binary}" — is it installed and on your PATH?`;
  }
  if (cause.killed) {
    return `"${binary}" did not finish in time and was stopped.`;
  }
  if (typeof cause.code === 'number') {
    return exitCodeMessage(binary, cause.code);
  }
  return `Running "${binary}" failed: ${cause.message}`;
}

function exitCodeMessage(binary: string, code: number): string {
  return `"${binary}" exited with code ${code}.`;
}

type ExecError = Error & { code?: number | string; killed?: boolean };

function isExecError(cause: unknown): cause is ExecError {
  return cause instanceof Error;
}
