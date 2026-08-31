import type { HerdrAgent, Target } from '../herdr/types.ts';
import { ok, type Result } from '../result.ts';
import { canonicalizePath } from './path.ts';

type Canonicalize = (path: string) => Promise<Result<string>>;

/** Decide which herdr agents own a project, best guess first. */
export async function rankTargets(
  agents: HerdrAgent[],
  scope: string,
  canonicalize: Canonicalize = canonicalizePath,
): Promise<Result<Target[]>> {
  const canonicalScope = await canonicalize(scope);
  if (!canonicalScope.ok) return canonicalScope;

  const matches: Target[] = [];
  for (const agent of agents) {
    if (await worksInside(agent, canonicalScope.value, canonicalize)) matches.push(toTarget(agent));
  }
  return ok(matches.sort(byMostRecentlyActive));
}

/**
 * Both directories are checked because a pane may sit at the repository root
 * while its foreground command runs from a package inside a monorepo.
 */
async function worksInside(
  agent: HerdrAgent,
  scope: string,
  canonicalize: Canonicalize,
): Promise<boolean> {
  for (const directory of [agent.cwd, agent.foreground_cwd]) {
    if (directory === undefined) continue;
    const canonicalDirectory = await canonicalize(directory);
    if (canonicalDirectory.ok && contains(scope, canonicalDirectory.value)) return true;
  }
  return false;
}

/** True when `child` is `parent` or sits inside it. */
function contains(parent: string, child: string): boolean {
  const base = trimTrailingSlash(parent);
  const inner = trimTrailingSlash(child);
  return inner === base || inner.startsWith(`${base}/`);
}

function trimTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

/** Focus wins outright; otherwise herdr's session-wide activity sequence wins. */
function byMostRecentlyActive(a: Target, b: Target): number {
  if (a.focused !== b.focused) return a.focused ? -1 : 1;
  return b.lastActiveSeq - a.lastActiveSeq;
}

function toTarget(agent: HerdrAgent): Target {
  return {
    paneId: agent.pane_id,
    workspaceId: agent.workspace_id,
    label: cleanLabel(agent.terminal_title_stripped) || agent.pane_id,
    agent: agent.agent,
    status: agent.agent_status ?? 'unknown',
    cwd: agent.cwd,
    focused: agent.focused === true,
    lastActiveSeq: agent.state_change_seq,
  };
}

function cleanLabel(title: string | undefined): string {
  return (title ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}
