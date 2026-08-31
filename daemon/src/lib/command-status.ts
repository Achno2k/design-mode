import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';

const execFileAsync = promisify(execFile);

export interface CommandStatus {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a no-shell subprocess while retaining stdout, stderr, and its exit status. */
export async function runCommandStatus(
  binary: string,
  args: string[],
  timeoutMs: number = config.commandTimeoutMs,
): Promise<Result<CommandStatus>> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return ok({ stdout, stderr, exitCode: 0 });
  } catch (cause) {
    if (isExecError(cause) && typeof cause.code === 'number') {
      return ok({ stdout: cause.stdout ?? '', stderr: cause.stderr ?? '', exitCode: cause.code });
    }
    return err(describeFailure(binary, cause));
  }
}

function describeFailure(binary: string, cause: unknown): string {
  if (!isExecError(cause)) return `Running "${binary}" failed for an unknown reason.`;
  if (cause.code === 'ENOENT') {
    return `Could not find "${binary}" — is it installed and on your PATH?`;
  }
  if (cause.killed) return `"${binary}" did not finish in time and was stopped.`;
  return `Running "${binary}" failed: ${cause.message}`;
}

type ExecError = Error & {
  code?: number | string;
  killed?: boolean;
  stdout?: string;
  stderr?: string;
};

function isExecError(cause: unknown): cause is ExecError {
  return cause instanceof Error;
}
