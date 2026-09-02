import { fail, ok, type Answer } from './messaging.ts';
import type {
  BlobResponse,
  HealthResponse,
  SendRequest,
  SendResponse,
  TargetsResponse,
} from './protocol.ts';

/** Must match `port` in the daemon configuration. */
export const BASE_URL = 'http://127.0.0.1:8791';

export const NOT_PAIRED = 'Not paired — open the popup and paste the pairing code.';

export const NOT_RUNNING =
  'The design-mode daemon is not running. Start it with `npm run dev` in a herdr pane.';
export const TIMED_OUT = 'The daemon timed out.';
const TOKEN_KEY = 'pairingToken';
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const REQUEST_TIMEOUT_MS = 8_000;
const BLOB_TIMEOUT_MS = 15_000;

/** Which herdr agents could act on `pageUrl`. */
export async function fetchTargets(pageUrl: string): Promise<Answer<TargetsResponse>> {
  return authenticatedTargets(pageUrl);
}

/** Deliver a review to the chosen agent. */
export async function postSend(body: SendRequest): Promise<Answer<SendResponse>> {
  return daemonRequest<SendResponse>(
    '/send',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { requiresAuth: true },
  );
}

/** Store a screenshot in the daemon before session state is persisted. */
export async function postBlob(base64Png: string): Promise<Answer<BlobResponse>> {
  const bytes = decodeBase64(base64Png);
  if (!bytes.ok) return bytes;

  const answer = await daemonRequest<BlobResponse>(
    '/blob',
    {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: copyBuffer(bytes.value),
    },
    { requiresAuth: true, timeoutMs: BLOB_TIMEOUT_MS },
  );
  if (!answer.ok) return answer;
  return typeof answer.value.blobId === 'string'
    ? answer
    : fail('The daemon did not return a screenshot id.');
}

/** Read and validate the open health endpoint. */
export async function checkHealth(): Promise<Answer<HealthResponse>> {
  const answer = await daemonRequest<HealthResponse>('/health');
  if (!answer.ok) return answer;

  const health = answer.value;
  if (
    health.ok !== true ||
    health.protocol !== 3 ||
    typeof health.tokenHint !== 'string' ||
    !/^[a-f0-9]{4}$/.test(health.tokenHint)
  ) {
    return fail('The daemon is running an incompatible protocol. Restart or update it.');
  }
  return ok(health);
}

/** Verify and remember a code copied from the daemon pane. */
export async function pairWithDaemon(
  code: string,
  pageUrl: string,
): Promise<Answer<HealthResponse>> {
  const token = code.trim();
  if (!TOKEN_PATTERN.test(token)) {
    return fail('The pairing code must be 32 lowercase hexadecimal characters.');
  }

  const health = await checkHealth();
  if (!health.ok) return health;

  const verified = await authenticatedTargets(pageUrl, token);
  if (!verified.ok) return verified;
  if (health.value.tokenHint !== token.slice(0, 4)) return fail(NOT_PAIRED);

  try {
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
    return health;
  } catch {
    return fail('Chrome could not save the pairing code.');
  }
}

/** Confirm that the saved code still authenticates with this daemon. */
export async function verifyStoredPairing(
  pageUrl: string,
  health: HealthResponse,
): Promise<Answer<true>> {
  const token = await readPairingToken();
  if (!token.ok) return token;
  if (token.value === null || health.tokenHint !== token.value.slice(0, 4)) return fail(NOT_PAIRED);

  const verified = await authenticatedTargets(pageUrl, token.value);
  return verified.ok ? ok(true) : verified;
}

async function authenticatedTargets(
  pageUrl: string,
  token?: string,
): Promise<Answer<TargetsResponse>> {
  const query = new URLSearchParams({ url: pageUrl });
  return daemonRequest<TargetsResponse>(
    `/targets?${query.toString()}`,
    { cache: 'no-store' },
    { requiresAuth: true, token },
  );
}

async function readPairingToken(): Promise<Answer<string | null>> {
  try {
    const stored = await chrome.storage.local.get(TOKEN_KEY);
    const value: unknown = stored[TOKEN_KEY];
    return ok(typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null);
  } catch {
    return fail('Chrome could not read the saved pairing code.');
  }
}

interface RequestOptions {
  requiresAuth?: boolean;
  token?: string;
  timeoutMs?: number;
}

/** Call the daemon: bearer token when required, timeout, and readable failures. */
export async function daemonRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<Answer<T>> {
  const prepared = await prepareRequest(init, options);
  if (!prepared.ok) return prepared;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...prepared.value, signal: controller.signal });
  } catch (cause) {
    return fail(cause instanceof DOMException && cause.name === 'AbortError' ? TIMED_OUT : NOT_RUNNING);
  } finally {
    clearTimeout(timeout);
  }

  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.status === 401) return fail(NOT_PAIRED);
  if (!response.ok) return fail(body?.error ?? `The daemon replied with ${response.status}.`);
  return body === null ? fail('The daemon sent a response that could not be read.') : ok(body);
}

async function prepareRequest(
  init: RequestInit,
  options: RequestOptions,
): Promise<Answer<RequestInit>> {
  const headers = new Headers(init.headers);
  if (options.requiresAuth === true) {
    const stored = options.token === undefined ? await readPairingToken() : ok(options.token);
    if (!stored.ok) return stored;
    if (stored.value === null) return fail(NOT_PAIRED);
    headers.set('authorization', `Bearer ${stored.value}`);
  }
  return ok({ ...init, headers });
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decodeBase64(value: string): Answer<Uint8Array> {
  try {
    const binary = atob(value);
    return ok(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return fail('The captured screenshot could not be prepared for upload.');
  }
}
