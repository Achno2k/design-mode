import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { test } from 'node:test';

import { createRequestListener, json, type RouteTable } from './router.ts';
import { createBlobHandler } from './routes/blob.ts';

const TOKEN = '0123456789abcdef0123456789abcdef';
const routes: RouteTable = {
  'GET /health': async () => json(200, { ok: true }),
  'GET /targets': async () => json(200, { candidates: [] }),
  'POST /blob': createBlobHandler({
    writeBlob: async () => ({ ok: true, value: 'unused' }),
  }),
};

interface ResponseValue {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

async function withServer(run: (port: number) => Promise<void>): Promise<void> {
  const server = createServer(createRequestListener(routes, TOKEN));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  try {
    if (address !== null && typeof address === 'object') await run(address.port);
  } finally {
    await close(server);
  }
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((cause) => (cause === undefined ? resolve() : reject(cause))),
  );
}

function get(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
  body?: Buffer,
): Promise<ResponseValue> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: text === '' ? null : JSON.parse(text),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

test('leaves health open but requires the exact bearer token for targets', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/health')).status, 200);

    const missing = await get(port, '/targets');
    assert.equal(missing.status, 401);
    assert.match((missing.body as { error: string }).error, /not paired/);
    assert.equal((await get(port, '/targets', { authorization: 'Bearer wrong' })).status, 401);
    assert.equal(
      (await get(port, '/targets', { authorization: `Bearer ${TOKEN}` })).status,
      200,
    );
  });
});

test('enforces the 16 MB blob cap through the raw-body reader', async () => {
  await withServer(async (port) => {
    const oversized = Buffer.alloc(16 * 1024 * 1024 + 1);
    const response = await get(
      port,
      '/blob',
      { authorization: `Bearer ${TOKEN}`, 'content-type': 'image/png' },
      'POST',
      oversized,
    );
    assert.equal(response.status, 413);
    assert.deepEqual(response.body, { error: 'The request body is larger than 16 MB.' });
  });
});

test('returns 400 instead of throwing when the Host header makes an invalid URL', async () => {
  await withServer(async (port) => {
    const malformed = await get(port, '/health', { host: '[' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.body, { error: 'The request URL was not valid.' });
  });
});

test('rejects web origins and echoes an allowed extension origin', async () => {
  await withServer(async (port) => {
    const denied = await get(port, '/health', { origin: 'https://evil.com' });
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { error: 'Requests from web pages are not allowed.' });

    const origin = 'chrome-extension://abcdefghijklmnop';
    const allowed = await get(port, '/health', { origin });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], origin);

    const preflight = await get(port, '/targets', { origin }, 'OPTIONS');
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-headers'], 'authorization, content-type');
  });
});
