import { runCommandAllowingEmpty } from '../lib/command.ts';
import { err, ok, type Result } from '../result.ts';

/** Hostnames that mean "a server running on this machine". */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * Find the project directory behind a `localhost` URL.
 *
 * This is the join key for the whole tool: a browser tab knows a port, and
 * herdr knows working directories. The process listening on that port sits
 * between them — its own working directory is the project the user is editing.
 */
export async function resolveProjectDir(rawUrl: string): Promise<Result<string>> {
  const port = readLocalPort(rawUrl);
  if (!port.ok) return port;

  const pids = await findListeningPids(port.value);
  if (!pids.ok) return pids;

  if (pids.value.length === 0) {
    return err(`Nothing is listening on port ${port.value} — is your dev server running?`);
  }

  // A dev server usually forks (Next.js, Vite) and every process in the tree
  // inherits the same working directory, so the first PID that answers is enough.
  for (const pid of pids.value) {
    const cwd = await readProcessCwd(pid);
    if (cwd.ok && cwd.value.length > 0) return cwd;
  }

  return err(`Found a server on port ${port.value} but could not read its working directory.`);
}

/** Pull the port out of a URL, rejecting anything that is not served locally. */
function readLocalPort(rawUrl: string): Result<number> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return err(`"${rawUrl}" is not a valid URL.`);
  }

  if (!LOCAL_HOSTNAMES.has(url.hostname)) {
    return err(`${url.hostname} is not running on this machine, so there is no project to match it to.`);
  }

  const port = url.port === '' ? defaultPortFor(url.protocol) : Number(url.port);
  if (port === null || !Number.isInteger(port)) {
    return err(`Could not work out which port "${rawUrl}" is using.`);
  }
  return ok(port);
}

function defaultPortFor(protocol: string): number | null {
  if (protocol === 'http:') return 80;
  if (protocol === 'https:') return 443;
  return null;
}

/**
 * `-nP` skips DNS and service-name lookups (much faster), `-sTCP:LISTEN` keeps
 * only the listening socket rather than every open connection to it, and `-t`
 * prints bare PIDs.
 */
async function findListeningPids(port: number): Promise<Result<number[]>> {
  const output = await runCommandAllowingEmpty('lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-t',
  ]);
  if (!output.ok) return output;

  const pids = output.value
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

  return ok(pids);
}

/**
 * `-d cwd` limits the listing to the working-directory entry and `-Fn` switches
 * to field output, where each value is prefixed by its field letter. The line
 * beginning with `n` holds the path.
 */
async function readProcessCwd(pid: number): Promise<Result<string>> {
  const output = await runCommandAllowingEmpty('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  if (!output.ok) return output;

  const pathLine = output.value.split('\n').find((line) => line.startsWith('n/'));
  return ok(pathLine === undefined ? '' : pathLine.slice(1));
}
