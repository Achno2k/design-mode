import { basename } from 'node:path';
import { listAgents } from '../../herdr/client.ts';
import type { Target } from '../../herdr/types.ts';
import { resolveProjectScope } from '../../resolve/scope.ts';
import { rankTargets } from '../../resolve/target.ts';
import { json, requireParam, type RouteContext, type RouteResult } from '../router.ts';

interface TargetsResponse {
  projectDir: string | null;
  scope: string | null;
  resolved: Target | null;
  candidates: Target[];
  message?: string;
  source: 'lsof' | 'none';
}

/** Map a browser page to the herdr agents that could act on it. */
export async function handleTargets({ url }: RouteContext): Promise<RouteResult> {
  const pageUrl = requireParam(url, 'url');
  if (pageUrl === null) {
    return json(400, { error: 'Add a ?url= parameter naming the page you are reviewing.' });
  }

  const project = await resolveProjectScope(pageUrl);
  if (!project.ok) return json(200, nothingFound(project.error));

  const agents = await listAgents();
  if (!agents.ok) return json(502, { error: agents.error });

  const ranked = await rankTargets(agents.value, project.value.scope);
  if (!ranked.ok) return json(200, nothingFound(ranked.error));
  const candidates = ranked.value;

  if (candidates.length === 0) {
    return json(200, {
      ...nothingFound(`No herdr agent is working in ${basename(project.value.scope)}.`),
      projectDir: project.value.projectDir,
      scope: project.value.scope,
      source: 'lsof',
    });
  }

  return json(200, {
    projectDir: project.value.projectDir,
    scope: project.value.scope,
    resolved: candidates[0] ?? null,
    candidates,
    source: 'lsof',
  } satisfies TargetsResponse);
}

function nothingFound(message: string): TargetsResponse {
  return {
    projectDir: null,
    scope: null,
    resolved: null,
    candidates: [],
    message,
    source: 'none',
  };
}
