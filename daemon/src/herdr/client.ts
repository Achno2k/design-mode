import { runCommand } from '../lib/command.ts';
import { err, ok, type Result } from '../result.ts';
import type { HerdrAgent } from './types.ts';

/**
 * Thin wrapper over the `herdr` CLI.
 *
 * The daemon only ever reads session state and sends prompts. It deliberately
 * does not create, close, or move panes — the browser should never be able to
 * rearrange the user's workspace.
 */

/** True when this process is running inside a herdr-managed pane. */
export function isInsideHerdr(): boolean {
  return process.env.HERDR_ENV === '1';
}

/** Every live agent in the current herdr session. */
export async function listAgents(): Promise<Result<HerdrAgent[]>> {
  const response = await runHerdr(['agent', 'list']);
  if (!response.ok) return response;

  const agents = readPath(response.value, ['result', 'agents']);
  if (!Array.isArray(agents)) {
    return err('herdr returned an agent list in an unexpected shape.');
  }
  return ok(agents.filter(isHerdrAgent));
}

/** Type text into the agent occupying `paneId` and submit it. */
export async function sendPrompt(paneId: string, text: string): Promise<Result<void>> {
  const response = await runHerdr(['agent', 'prompt', paneId, text]);
  return response.ok ? ok(undefined) : response;
}

/**
 * Run a herdr subcommand and parse its JSON response.
 *
 * herdr exits 0 even when the command failed and reports the problem in an
 * `error` object instead, so the exit code alone is not enough to tell whether
 * a prompt actually reached an agent.
 */
async function runHerdr(args: string[]): Promise<Result<unknown>> {
  const output = await runCommand('herdr', args);
  if (!output.ok) return output;

  let response: unknown;
  try {
    response = JSON.parse(output.value);
  } catch {
    return err(`Could not read the response from "herdr ${args.join(' ')}".`);
  }

  const failure = readErrorMessage(response);
  return failure === null ? ok(response) : err(failure);
}

/** Pull herdr's own error message out of a response, or null when it succeeded. */
function readErrorMessage(response: unknown): string | null {
  const error = readPath(response, ['error']);
  if (error === undefined || error === null) return null;

  const message = readPath(error, ['message']);
  return typeof message === 'string' ? message : 'herdr reported an error.';
}

/** Walk a chain of object keys, returning undefined the moment one is missing. */
function readPath(value: unknown, keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

/**
 * Only the fields the daemon reads are validated. herdr may add more over time
 * and an unknown extra field should never make an agent disappear from the list.
 */
function isHerdrAgent(value: unknown): value is HerdrAgent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.agent === 'string' &&
    typeof candidate.cwd === 'string' &&
    typeof candidate.pane_id === 'string' &&
    typeof candidate.workspace_id === 'string' &&
    typeof candidate.state_change_seq === 'number'
  );
}
