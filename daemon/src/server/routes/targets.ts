import { listAgents } from '../../herdr/client.ts';
import type { Target } from '../../herdr/types.ts';
import { resolveProjectDir } from '../../resolve/dev-server.ts';
import { findRepoRoot } from '../../resolve/repo.ts';
import { rankTargets } from '../../resolve/target.ts';
import { json, requireParam, type RouteContext, type RouteResult } from '../router.ts';

/** Answer to `GET /targets`. */
interface TargetsResponse {
  /** Directory the dev server is running from, or null when it could not be resolved. */
  projectDir: string | null;
  /** Repository the search was limited to, when the project is inside one. */
  scope: string | null;
  /** Best guess at the session the user was last working in. */
  resolved: Target | null;
  /** Every agent that matched, so the popup can offer an override. */
  candidates: Target[];
  /** Set when nothing matched; safe to show verbatim in the browser. */
  message?: string;
}

/**
 * Map a browser URL to the herdr agents that could act on it.
 *
 * Failing to resolve is not an error: the user may simply have a non-local tab
 * focused, and the overlay should explain that rather than show a crash. Only a
 * broken herdr session returns a non-200.
 */
export async function handleTargets({ url }: RouteContext): Promise<RouteResult> {
  const pageUrl = requireParam(url, 'url');
  if (pageUrl === null) {
    return json(400, { error: 'Add a ?url= parameter naming the page you are reviewing.' });
  }

  const projectDir = await resolveProjectDir(pageUrl);
  if (!projectDir.ok) {
    return json(200, nothingFound(projectDir.error));
  }

  const agents = await listAgents();
  if (!agents.ok) {
    return json(502, { error: agents.error });
  }

  // Prefer the repository root so an agent at the root still matches a dev
  // server started from a package inside it.
  const scope = (await findRepoRoot(projectDir.value)) ?? projectDir.value;
  const candidates = rankTargets(agents.value, scope);

  if (candidates.length === 0) {
    return json(200, {
      ...nothingFound(`No herdr agent is working in ${scope}.`),
      projectDir: projectDir.value,
      scope,
    });
  }

  return json(200, {
    projectDir: projectDir.value,
    scope,
    resolved: candidates[0] ?? null,
    candidates,
  } satisfies TargetsResponse);
}

function nothingFound(message: string): TargetsResponse {
  return { projectDir: null, scope: null, resolved: null, candidates: [], message };
}
