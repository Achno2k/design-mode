import type { HerdrAgent, Target } from '../herdr/types.ts';

/**
 * Decide which herdr agents own a given project, best guess first.
 *
 * The caller shows the first entry as the default and the rest as overrides —
 * the ranking is a suggestion, never an automatic send.
 *
 * `scope` is the repository root when the project is inside one, otherwise the
 * dev server's own directory. Matching is deliberately one-directional: an
 * agent must be sitting inside the scope. Matching upwards as well would let an
 * agent in a parent directory claim every project underneath it.
 */
export function rankTargets(agents: HerdrAgent[], scope: string): Target[] {
  return agents
    .filter((agent) => worksInside(agent, scope))
    .map(toTarget)
    .sort(byMostRecentlyActive);
}

/**
 * Both directories are checked because the pane may have been started at the
 * repository root while the command running in it moved elsewhere — in a
 * monorepo the agent usually sits at the root while `npm run dev` runs from
 * something like `apps/web`.
 */
function worksInside(agent: HerdrAgent, scope: string): boolean {
  return [agent.cwd, agent.foreground_cwd].some(
    (dir) => dir !== undefined && contains(scope, dir),
  );
}

/** True when `child` is `parent` or sits inside it. */
function contains(parent: string, child: string): boolean {
  const base = trimTrailingSlash(parent);
  const inner = trimTrailingSlash(child);
  // The separator check stops "/repo/app" from matching "/repo/app-clip-web".
  return inner === base || inner.startsWith(`${base}/`);
}

function trimTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * The pane the herdr UI has focused wins outright. Otherwise the highest
 * `state_change_seq` wins, because it is bumped on every agent state change and
 * is comparable across the whole session.
 */
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

/**
 * herdr prefixes titles with a status glyph and its own stripping does not
 * catch every variant, so leading symbols are removed here as well.
 */
function cleanLabel(title: string | undefined): string {
  return (title ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}
