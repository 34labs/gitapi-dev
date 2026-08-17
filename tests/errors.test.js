import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretHttpStatus, interpretFetchFailure, ResolverError, ResolverErrorCode } from '../src/core/errors.js';

test('404 for a github user suggests the org endpoint', () => {
  const interp = interpretHttpStatus(404, 'github', [], { resourceType: 'user', params: { login: 'flessan' } });
  assert.equal(interp.title, 'HTTP 404: github did not find this resource');
  assert.ok(interp.causes.some((c) => c.includes('organization')));
  assert.ok(interp.actions.some((a) => a.includes('/orgs/flessan')));
});

test('404 for a github user offers a one-click org quick action', () => {
  const interp = interpretHttpStatus(404, 'github', [], { resourceType: 'user', params: { login: 'flessan' } });
  assert.ok(Array.isArray(interp.quickActions) && interp.quickActions.length === 1);
  assert.equal(interp.quickActions[0].input, 'https://github.com/orgs/flessan');
});

test('404 for gitlab project mentions URL-encoded paths', () => {
  const interp = interpretHttpStatus(404, 'gitlab', [], { resourceType: 'project', params: { fullPath: 'a/b' } });
  assert.ok(interp.causes.some((c) => c.includes('URL-encoded')));
});

test('429 is interpreted as rate limiting', () => {
  const interp = interpretHttpStatus(429, 'gitea', []);
  assert.ok(interp.title.includes('rate limited'));
  assert.ok(interp.actions.some((a) => a.includes('rate-limit') || a.includes('cached')));
});

test('403 with x-ratelimit-remaining: 0 is interpreted as rate limiting', () => {
  const interp = interpretHttpStatus(403, 'github', [['X-RateLimit-Remaining', '0'], ['X-RateLimit-Reset', '1893456000']]);
  assert.ok(interp.title.includes('rate limited'));
});

test('401 mentions authentication', () => {
  const interp = interpretHttpStatus(401, 'github', []);
  assert.ok(interp.causes.some((c) => c.includes('authentication') || c.includes('token')));
});

test('5xx is attributed to the provider, not GitAPITaker', () => {
  const interp = interpretHttpStatus(502, 'gitlab', []);
  assert.ok(interp.title.includes('server error'));
  assert.ok(interp.causes.some((c) => c.includes('provider API itself failed')));
});

test('unknown 4xx without special handling returns null', () => {
  assert.equal(interpretHttpStatus(418, 'github', []), null);
});

test('success statuses are not interpreted', () => {
  assert.equal(interpretHttpStatus(200, 'github', []), null);
});

test('abort is interpreted as timeout/abort', () => {
  const err = new Error('aborted'); err.name = 'AbortError';
  const interp = interpretFetchFailure(err);
  assert.ok(interp.title.toLowerCase().includes('timed out'));
});

test('offline environment gets an offline message', () => {
  const interp = interpretFetchFailure(new TypeError('Failed to fetch'), { online: false });
  assert.ok(interp.title.toLowerCase().includes('offline'));
});

test('generic fetch failure mentions network/CORS causes', () => {
  const interp = interpretFetchFailure(new TypeError('Failed to fetch'), { online: true });
  assert.ok(interp.causes.some((c) => c.includes('CORS')));
});

test('ResolverError carries code and hints', () => {
  const err = new ResolverError(ResolverErrorCode.UNSUPPORTED_PROVIDER, 'nope', ['hint']);
  assert.equal(err.code, 'unsupported-provider');
  assert.deepEqual(err.hints, ['hint']);
  assert.ok(err instanceof Error);
});
