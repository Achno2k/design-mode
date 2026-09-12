/** Event the hooked page dispatches on `document` for every error it sees. */
export const CONSOLE_EVENT = 'nudge-console';

/** One error, as the page reports it. Travels as JSON — see `installConsoleHook`. */
export interface ConsoleHookEntry {
  level: 'error' | 'rejection' | 'console';
  message: string;
  stack?: string;
  /** Milliseconds since the epoch, read in the page. */
  at: number;
  pageUrl: string;
}

/**
 * Watch the page's console and its unhandled failures, from inside its world.
 *
 * This function is handed to `chrome.scripting.executeScript` and serialised
 * with `toString()`, so it must be entirely self-contained: no imports, no
 * module-scope constants, no helpers declared outside it. The event name
 * arrives through `args` for that reason — see `inspect/source.ts`.
 *
 * It has to run in the MAIN world because a content script has its own
 * `console` object; wrapping that one would never see the page's own calls.
 *
 * Findings are handed back as a `CustomEvent` on `document`, the one channel
 * both worlds share. The payload is a JSON string rather than an object because
 * objects created in the page's world do not survive the hop across the
 * isolated-world boundary intact.
 *
 * Installing twice would double-count every error, so the page is marked.
 */
export function installConsoleHook(eventName: string): boolean {
  const scope = window as unknown as Record<string, unknown>;
  if (scope.__hdmConsoleHook === true) return true;
  scope.__hdmConsoleHook = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    report('console', describeAll(args), stackOf(args.find((arg) => arg instanceof Error)));
    originalError(...args);
  };

  window.addEventListener('error', (event: ErrorEvent) => {
    const message = describe(event.error) ?? event.message;
    report('error', message === '' ? 'Uncaught error' : message, stackOf(event.error));
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    report('rejection', describe(reason) ?? 'Unhandled promise rejection', stackOf(reason));
  });

  return true;

  /** Never let reporting break the page it is watching. */
  function report(
    level: 'error' | 'rejection' | 'console',
    message: string,
    stack: string | undefined,
  ): void {
    try {
      const entry = {
        level,
        message,
        ...(stack === undefined ? {} : { stack }),
        at: Date.now(),
        pageUrl: window.location.href,
      };
      document.dispatchEvent(new CustomEvent(eventName, { detail: JSON.stringify(entry) }));
    } catch {
      // A value that cannot be described is not worth failing a page over.
    }
  }

  function describeAll(args: unknown[]): string {
    const described = args.map((arg) => describe(arg) ?? String(arg)).join(' ');
    return described.trim() === '' ? 'console.error called with no message' : described;
  }

  function describe(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;

    try {
      // Plain objects say far more as JSON than as "[object Object]".
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch {
      return String(value);
    }
  }

  function stackOf(value: unknown): string | undefined {
    return value instanceof Error && typeof value.stack === 'string' ? value.stack : undefined;
  }
}
