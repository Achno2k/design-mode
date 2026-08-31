import { err, ok, type Result } from '../result.ts';
import { resolveProjectDir } from './dev-server.ts';
import { canonicalizePath } from './path.ts';
import { findRepoRoot } from './repo.ts';

export interface ProjectScope {
  projectDir: string;
  scope: string;
}

interface ScopeDependencies {
  resolveProjectDir: typeof resolveProjectDir;
  canonicalizePath: typeof canonicalizePath;
  findRepoRoot: typeof findRepoRoot;
}

/** Resolve and canonicalize the project and repository behind a browser page. */
export async function resolveProjectScope(
  pageUrl: string,
  dependencies: ScopeDependencies = { resolveProjectDir, canonicalizePath, findRepoRoot },
): Promise<Result<ProjectScope>> {
  const project = await dependencies.resolveProjectDir(pageUrl);
  if (!project.ok) return project;

  const canonicalProject = await dependencies.canonicalizePath(project.value);
  if (!canonicalProject.ok) return canonicalProject;

  const repository = await dependencies.findRepoRoot(canonicalProject.value);
  if (!repository.ok) return repository;

  const candidateScope = repository.value ?? canonicalProject.value;
  const canonicalScope = await dependencies.canonicalizePath(candidateScope);
  if (!canonicalScope.ok) return canonicalScope;
  if (canonicalScope.value === '') return err('The project scope resolved to an empty path.');

  return ok({ projectDir: canonicalProject.value, scope: canonicalScope.value });
}
