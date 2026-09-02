import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { log } from '../logger.ts';
import { err, ok, type Result } from '../result.ts';

const MAX_JSON_BYTES = 32 * 1024 * 1024;
const PROTECTED_PATHS = new Set(['/targets', '/send', '/blob', '/pick', '/pick/follow-up']);
const PAIRING_ERROR =
  'This extension is not paired with the daemon. Open the popup and paste the pairing code from the daemon\'s pane.';

export interface RouteResult {
  status: number;
  body: unknown;
}

export interface RouteContext {
  url: URL;
  readJson: () => Promise<Result<unknown>>;
  readBody: (maxBytes: number) => Promise<Result<Buffer>>;
}

export type RouteHandler = (context: RouteContext) => Promise<RouteResult>;
export type RouteTable = Record<string, RouteHandler>;

/** Build a request listener with origin and pairing checks around every route. */
export function createRequestListener(routes: RouteTable, token: string) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const origin = readOrigin(request);
    if (origin !== undefined && !origin.startsWith('chrome-extension://')) {
      send(response, json(403, { error: 'Requests from web pages are not allowed.' }));
      return;
    }

    try {
      const url = readRequestUrl(request);
      if (!url.ok) {
        send(response, json(400, { error: url.error }), origin);
        return;
      }
      const method = request.method ?? 'GET';

      if (method === 'OPTIONS') {
        send(response, { status: 204, body: null }, origin);
        return;
      }
      if (PROTECTED_PATHS.has(url.value.pathname) && !isAuthorized(request, token)) {
        send(response, json(401, { error: PAIRING_ERROR }), origin);
        return;
      }

      const handler = routes[`${method} ${url.value.pathname}`];
      if (handler === undefined) {
        send(response, json(404, { error: `No route for ${method} ${url.value.pathname}.` }), origin);
        return;
      }

      const readBody = (maxBytes: number): Promise<Result<Buffer>> =>
        readRequestBody(request, maxBytes);
      const result = await handler({
        url: url.value,
        readBody,
        readJson: () => readJsonBody(request),
      });
      send(response, result, origin);
    } catch (cause) {
      log.error(`Request threw: ${cause instanceof Error ? cause.stack : String(cause)}`);
      send(
        response,
        json(500, { error: 'The daemon hit an unexpected error. Check its pane.' }),
        origin,
      );
    }
  };
}

function readRequestUrl(request: IncomingMessage): Result<URL> {
  try {
    return ok(new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`));
  } catch {
    return err('The request URL was not valid.');
  }
}

function readOrigin(request: IncomingMessage): string | undefined {
  const origin = request.headers.origin;
  return Array.isArray(origin) ? origin[0] : origin;
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function send(response: ServerResponse, result: RouteResult, origin?: string): void {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  if (origin !== undefined) headers['access-control-allow-origin'] = origin;

  response.writeHead(result.status, headers);
  response.end(result.body === null ? '' : JSON.stringify(result.body));
}

async function readJsonBody(request: IncomingMessage): Promise<Result<unknown>> {
  const body = await readRequestBody(request, MAX_JSON_BYTES);
  if (!body.ok) return body;

  try {
    return ok(JSON.parse(body.value.toString('utf8')));
  } catch {
    return err('The request body was not valid JSON.');
  }
}

async function readRequestBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Result<Buffer>> {
  const chunks: Buffer[] = [];
  let size = 0;
  let isTooLarge = false;

  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) {
        isTooLarge = true;
        continue;
      }
      chunks.push(chunk as Buffer);
    }
  } catch {
    return err('Could not read the request body. Try sending it again.');
  }

  return isTooLarge
    ? err(`The request body is larger than ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
    : ok(Buffer.concat(chunks));
}

export function requireParam(url: URL, name: string): string | null {
  const value = url.searchParams.get(name);
  return value === null || value.trim() === '' ? null : value;
}

export function json(status: number, body: unknown): RouteResult {
  return { status, body };
}
