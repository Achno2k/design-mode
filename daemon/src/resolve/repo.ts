import { runCommandStatus, type CommandStatus } from '../lib/command-status.ts';
import { err, ok, type Result } from '../result.ts';

type RunGit = (binary: string, args: string[]) => Promise<Result<CommandStatus>>;

/** Find the git repository containing `directory`, or null when it is not in one. */
export async function findRepoRoot(
  directory: string,
  runGit: RunGit = runCommandStatus,
): Promise<Result<string | null>> {
  const output = await runGit('git', ['-C', directory, 'rev-parse', '--show-toplevel']);
  if (!output.ok) return output;

  if (output.value.exitCode === 0) {
    const root = output.value.stdout.trim();
    return root === ''
      ? err(`Git did not report the repository containing ${directory}.`)
      : ok(root);
  }

  if (isOutsideRepository(output.value)) return ok(null);

  const detail = output.value.stderr.trim();
  return err(
    detail === ''
      ? `Could not inspect the repository containing ${directory}; Git exited with code ${output.value.exitCode}.`
      : `Could not inspect the repository containing ${directory}: ${detail}`,
  );
}

function isOutsideRepository(status: CommandStatus): boolean {
  return status.exitCode === 128 && /not a git repository/i.test(status.stderr);
}
