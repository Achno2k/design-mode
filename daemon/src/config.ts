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
  picksDir: '/tmp/herdr-picks',

  /**
   * Build output the daemon watches so the extension can reload itself.
   *
   * The published daemon is a single bundled file, so it cannot find the
   * extension by walking up from its own source path. `bin/herdr-design-mode`
   * passes the directory instead: it is the one file that sits at the same
   * depth in a clone and in the package. The relative path is what `npm run
   * dev` uses, and `fileURLToPath` rather than `.pathname`, which would leave
   * %20 in a path containing a space.
   */
  distDir:
    process.env.HERDR_DESIGN_MODE_DIST ??
    fileURLToPath(new URL('../../extension/dist', import.meta.url)),

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
