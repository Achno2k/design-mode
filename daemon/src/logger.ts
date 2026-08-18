/** Console logging with a consistent prefix, so daemon output is easy to spot in a busy pane. */

const PREFIX = '[design-mode]';

export const log = {
  info(message: string): void {
    console.log(`${PREFIX} ${message}`);
  },

  warn(message: string): void {
    console.warn(`${PREFIX} ${message}`);
  },

  error(message: string): void {
    console.error(`${PREFIX} ${message}`);
  },
};
