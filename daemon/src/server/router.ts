import type { IncomingMessage, ServerResponse } from 'node:http';

import { log } from '../logger.ts';
import { err, ok, type Result } from '../result.ts';

/** Largest request body accepted, sized for a handful of full-width screenshots. */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** What a handler returns; the router turns it into an HTTP response. */
export interface RouteResult {
  status: number;
  body: unknown;
}

/** Everything a handler is given. `readJson` is lazy so GET handlers never touch the stream. */
export interface RouteContext {
  url: URL;
  readJson: () => Promise<Result<unknown>>;
}

export type RouteHandler = (context: RouteContext) => Promise<RouteResult>;

/** Handlers keyed by `"<METHOD> <pathname>"`, e.g. `"GET /targets"`. */
export type RouteTable = Record<string, RouteHandler>;

/** Build a Node request listener that dispatches to `routes` and always replies with JSON. */
export function createRequestListener(routes: RouteTable) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const method = request.method ?? 'GET';

    // Preflight only happens when the daemon is called from a page rather than
    // the extension's background worker, which is the case while debugging.
    if (method === 'OPTIONS') {
      send(response, { status: 204, body: null });
      return;
    }

    const handler = routes[`${method} ${url.pathname}`];
    if (handler === undefined) {
      send(response, { status: 404, body: { error: `No route for ${method} ${url.pathname}.` } });
      return;
    }

    try {
      send(response, await handler({ url, readJson: () => readJsonBody(request) }));
    } catch (cause) {
      // A handler throwing is a bug rather than an expected failure, so it is
      // logged in full here and reported to the browser as a flat 500.
      log.error(`${method} ${url.pathname} threw: ${cause instanceof Error ? cause.stack : String(cause)}`);
      send(response, {
        status: 500,
        body: { error: 'The daemon hit an unexpected error. Check its pane.' },
      });
    }
  };
}

function send(response: ServerResponse, result: RouteResult): void {
  response.writeHead(result.status, {
    'content-type': 'application/json; charset=utf-8',
    // The extension calls from its background worker, which is not subject to
    // CORS. These headers exist so the daemon can also be poked from a browser
    // tab or curl while debugging.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  response.end(result.body === null ? '' : JSON.stringify(result.body));
}

async function readJsonBody(request: IncomingMessage): Promise<Result<unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      return err('That review is too large to send. Try fewer selections.');
    }
    chunks.push(chunk as Buffer);
  }

  try {
    return ok(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    return err('The request body was not valid JSON.');
  }
}

/** Read a required query parameter, or null when it is missing or blank. */
export function requireParam(url: URL, name: string): string | null {
  const value = url.searchParams.get(name);
  return value === null || value.trim() === '' ? null : value;
}

/** Shorthand for building a handler's return value. */
export function json(status: number, body: unknown): RouteResult {
  return { status, body };
}
