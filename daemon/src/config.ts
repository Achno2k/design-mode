import { fileURLToPath } from 'node:url';

/**
 * Runtime configuration.
 *
 * This is a personal tool running on one machine, so the values are constants
 * rather than environment variables. Change them here.
 */
export const config = {
  /** Port the extension's background worker talks to. Loopback only (8787 is taken by forge). */
  port: 8791,

  /** Interface to bind. Never widen this — the daemon runs `herdr` commands. */
  host: '127.0.0.1',

  /** Where selection payloads are written for the agent to read. */
  picksDir: '/tmp/nudge-picks',

  /**
   * Build output the daemon watches so the extension can reload itself.
   *
   * The published daemon is a single bundled file, so it cannot find the
   * extension by walking up from its own source path. `bin/nudge`
   * passes the directory instead: it is the one file that sits at the same
   * depth in a clone and in the package. The relative path is what `npm run
   * dev` uses, and `fileURLToPath` rather than `.pathname`, which would leave
   * %20 in a path containing a space.
   */
  distDir:
    process.env.NUDGE_DIST ??
    fileURLToPath(new URL('../../extension/dist', import.meta.url)),

  /**
   * Shown under the start-up banner. The published daemon is bundled and cannot
   * read a package.json, so `bin/nudge` passes it; `npm run dev`
   * gets npm's own variable.
   */
  version: process.env.NUDGE_VERSION ?? process.env.npm_package_version,

  /**
   * The command the pairing card tells the user to run for the extension
   * folder. `bin/nudge` knows how it was installed and passes the right one;
   * `npm run dev` in a clone has no bin, so it gets the clone's own command.
   */
  extensionCommand: process.env.NUDGE_EXTENSION_COMMAND ?? 'npx . extension',

  /** How long a live-reload poll is held open before answering with no change. */
  buildPollMs: 25_000,

  /** Reviews and unclaimed screenshot blobs are removed after this age. */
  pickTtlMs: 7 * 24 * 60 * 60 * 1_000,

  /**
   * Hard ceiling on any external command. Both `lsof` and `herdr` answer in
   * milliseconds, so anything approaching this means the command is wedged and
   * we would rather fail with a message than hang the browser.
   */
  commandTimeoutMs: 5_000,
} as const;
