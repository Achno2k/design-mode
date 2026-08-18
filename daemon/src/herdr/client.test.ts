import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * herdr signals failure in the response body rather than the exit code, so the
 * detection logic is exercised directly here against real CLI output.
 */

// Mirrors the private helper in client.ts; kept in sync deliberately so the
// parsing rule can be tested without exporting internals.
function readErrorMessage(response: unknown): string | null {
  const error = (response as { error?: unknown } | null)?.error;
  if (error === undefined || error === null) return null;

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : 'herdr reported an error.';
}

test('detects a failure that exited zero', () => {
  const real = JSON.parse(
    '{"error":{"code":"agent_not_found","message":"agent target w9:p99 not found"},"id":"cli:agent:prompt"}',
  );
  assert.equal(readErrorMessage(real), 'agent target w9:p99 not found');
});

test('treats a normal response as success', () => {
  assert.equal(readErrorMessage({ id: 'cli:agent:list', result: { agents: [] } }), null);
});

test('falls back to a generic message when the error has no text', () => {
  assert.equal(readErrorMessage({ error: { code: 'oops' } }), 'herdr reported an error.');
});
