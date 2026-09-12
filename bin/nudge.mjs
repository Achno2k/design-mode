#!/usr/bin/env node

/**
 * The one entry point the package installs.
 *
 * With no arguments it starts the daemon, which is what `npx .` in a herdr
 * pane does. `extension` prints the directory Chrome loads unpacked, because
 * the extension ships inside this package rather than a web store.
 *
 * This file sits at the same depth in a clone and in the published package,
 * which makes it the only reliable place to resolve either sibling: the
 * published daemon is a single bundled file, and the extension has no source
 * path at all once it is built.
 */

import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = fileURLToPath(new URL('../extension/dist/', import.meta.url));
const PACKAGE_JSON = new URL('../package.json', import.meta.url);
const BUNDLED_DAEMON = new URL('../dist/daemon.js', import.meta.url);
const DAEMON_SOURCE = new URL('../daemon/src/index.ts', import.meta.url);

const [command] = process.argv.slice(2);

switch (command) {
  case undefined:
    await startDaemon();
    break;
  case 'extension':
    await printExtensionPath();
    break;
  case 'help':
  case '--help':
  case '-h':
    printUsage();
    break;
  default:
    console.error(`Unknown command "${command}".\n`);
    printUsage();
    process.exit(1);
}

/**
 * Prefer the bundled daemon, fall back to the TypeScript in a clone.
 *
 * Only the fallback needs a modern Node: type stripping arrived in 23.6, and
 * Node refuses to strip types under `node_modules` at all, which is why the
 * package ships JavaScript.
 */
async function startDaemon() {
  if (process.env.HERDR_ENV !== '1') {
    console.error(
      'Nudge must be started from a pane in your herdr session (HERDR_ENV=1 was not found).',
    );
    process.exit(1);
  }

  process.env.NUDGE_DIST ??= EXTENSION_DIR;
  process.env.NUDGE_VERSION ??= await readVersion();

  if (await exists(BUNDLED_DAEMON)) {
    await import(BUNDLED_DAEMON.href);
    return;
  }

  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  if (major < 23 || (major === 23 && minor < 6)) {
    console.error(
      `Running the daemon from source requires Node 23.6 or newer; this process is running Node ${process.versions.node}.\n` +
        'Run `npm run build:daemon` to produce dist/daemon.js, which any supported Node can start.',
    );
    process.exit(1);
  }

  await import(DAEMON_SOURCE.href);
}

/**
 * Chrome cannot install this from a URL, so the path is the deliverable.
 *
 * It is printed on its own line, unadorned, so `nudge-mode extension`
 * can be piped straight into `pbcopy` while the instructions go to stderr.
 */
async function printExtensionPath() {
  if (!(await exists(EXTENSION_DIR))) {
    console.error(
      `The extension build is missing from ${EXTENSION_DIR}.\n` +
        'From a clone, run `npm run build:extension` first.',
    );
    process.exit(1);
  }

  console.error('Load the extension in Chrome:');
  console.error('  1. Open chrome://extensions');
  console.error('  2. Turn on Developer mode');
  console.error('  3. Choose "Load unpacked" and pick the directory below\n');
  console.log(EXTENSION_DIR);
}

/** The package version for the banner, or empty when package.json cannot be read. */
async function readVersion() {
  try {
    const manifest = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'));
    return typeof manifest.version === 'string' ? manifest.version : '';
  } catch {
    return '';
  }
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function printUsage() {
  console.error('Usage:');
  console.error('  nudge-mode              Start the daemon (inside a herdr pane)');
  console.error('  nudge-mode extension    Print the directory to load unpacked in Chrome');
}
