#!/usr/bin/env node

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(
    `herdr design mode requires Node 23.6 or newer; this process is running Node ${process.versions.node}.`,
  );
  process.exit(1);
}

if (process.env.HERDR_ENV !== '1') {
  console.error(
    'herdr design mode must be started from a pane in your herdr session (HERDR_ENV=1 was not found).',
  );
  process.exit(1);
}

await import(new URL('../daemon/src/index.ts', import.meta.url).href);
