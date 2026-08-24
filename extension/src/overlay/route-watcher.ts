const CHECK_INTERVAL_MS = 250;

/** Notice client-side route changes that do not replace the content script. */
export interface RouteWatcher {
  start(): void;
  stop(): void;
}

export function createRouteWatcher(onChange: (url: string) => void): RouteWatcher {
  let previousUrl = window.location.href;
  let interval: number | null = null;

  function check(): void {
    const nextUrl = window.location.href;
    if (nextUrl === previousUrl) return;
    previousUrl = nextUrl;
    onChange(nextUrl);
  }

  function start(): void {
    if (interval !== null) return;
    previousUrl = window.location.href;
    interval = window.setInterval(check, CHECK_INTERVAL_MS);
  }

  function stop(): void {
    if (interval !== null) window.clearInterval(interval);
    interval = null;
  }

  return { start, stop };
}
