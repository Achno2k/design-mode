import { runCommandAllowingEmpty } from '../lib/command.ts';
import { err, ok, type Result } from '../result.ts';
import { findRepoRoot } from './repo.ts';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

interface DevServerDependencies {
  runCommand: typeof runCommandAllowingEmpty;
  findRepoRoot: typeof findRepoRoot;
}

/** Find the project directory behind a localhost URL. */
export async function resolveProjectDir(
  rawUrl: string,
  dependencies: DevServerDependencies = {
    runCommand: runCommandAllowingEmpty,
    findRepoRoot,
  },
): Promise<Result<string>> {
  const port = readLocalPort(rawUrl);
  if (!port.ok) return port;

  const pids = await findListeningPids(port.value, dependencies.runCommand);
  if (!pids.ok) return pids;
  if (pids.value.length === 0) {
    return err(`Nothing is listening on port ${port.value} — is your dev server running?`);
  }

  let firstDirectory: string | null = null;
  for (const pid of pids.value) {
    const directory = await readProcessCwd(pid, dependencies.runCommand);
    if (!directory.ok || directory.value === '') continue;
    firstDirectory ??= directory.value;

    const repository = await dependencies.findRepoRoot(directory.value);
    if (repository.ok && repository.value !== null) return ok(directory.value);
  }

  return firstDirectory === null
    ? err(`Found a server on port ${port.value} but could not read its working directory.`)
    : ok(firstDirectory);
}

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

/** Ask lsof only for PIDs holding a listening socket on the selected port. */
async function findListeningPids(
  port: number,
  runCommand: typeof runCommandAllowingEmpty,
): Promise<Result<number[]>> {
  const output = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  if (!output.ok) return output;

  const pids = output.value
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
    .sort((left, right) => left - right);
  return ok(pids);
}

/** Read the cwd field from lsof's machine-readable output. */
async function readProcessCwd(
  pid: number,
  runCommand: typeof runCommandAllowingEmpty,
): Promise<Result<string>> {
  const output = await runCommand('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  if (!output.ok) return output;

  const pathLine = output.value.split('\n').find((line) => line.startsWith('n/'));
  return ok(pathLine === undefined ? '' : pathLine.slice(1));
}
