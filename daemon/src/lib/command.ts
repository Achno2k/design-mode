import { err, ok, type Result } from '../result.ts';
import { runCommandStatus, type CommandStatus } from './command-status.ts';

/**
 * Run an external command and return its stdout.
 *
 * The status runner uses `execFile`, so browser-derived arguments never pass
 * through a shell or become a command-injection surface.
 */
export async function runCommand(
  binary: string,
  args: string[],
  timeoutMs?: number,
): Promise<Result<string>> {
  const result = await runCommandStatus(binary, args, timeoutMs);
  if (!result.ok) return result;
  return result.value.exitCode === 0
    ? ok(result.value.stdout)
    : err(describeExit(binary, result.value));
}

/** Treat exit code 1 as an empty match, as required by lsof lookups. */
export async function runCommandAllowingEmpty(
  binary: string,
  args: string[],
  timeoutMs?: number,
): Promise<Result<string>> {
  const result = await runCommandStatus(binary, args, timeoutMs);
  if (!result.ok) return result;
  if (result.value.exitCode === 0) return ok(result.value.stdout);
  return result.value.exitCode === 1 ? ok('') : err(describeExit(binary, result.value));
}

function describeExit(binary: string, status: CommandStatus): string {
  const detail = status.stderr.trim();
  return detail === ''
    ? `"${binary}" exited with code ${status.exitCode}.`
    : `"${binary}" failed: ${detail}`;
}
