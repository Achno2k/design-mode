import { runCommand } from '../lib/command.ts';

/**
 * Find the git repository containing `dir`, or null when there is not one.
 *
 * This bounds how far a match may reach. Without it, an agent parked in a
 * parent directory — a home directory being the worst case — looks like the
 * owner of every project beneath it.
 */
export async function findRepoRoot(dir: string): Promise<string | null> {
  const output = await runCommand('git', ['-C', dir, 'rev-parse', '--show-toplevel']);
  if (!output.ok) return null;

  const root = output.value.trim();
  return root === '' ? null : root;
}
