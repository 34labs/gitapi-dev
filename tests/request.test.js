import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeEndpoint, byteLength, tryParseJson } from '../src/core/request.js';
import { createFetchMock, failingFetch } from './helpers/mock-fetch.js';
import { loadFixture } from './helpers/fixtures.js';

const endpoint = {
  providerId: 'github',
  method: 'GET',
  url: 'https://api.github.com/users/flessan',
  headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
};

test('successful request produces an honest live record', async () => {
  const body = loadFixture('github-user.json');
  const fetchImpl = createFetchMock({ status: 200, statusText: 'OK', headers: { 'content-type': 'application/json; charset=utf-8', etag: 'W/"abc"' }, body });
  const result = await executeEndpoint(endpoint, { fetchImpl });
  assert.equal(result.ok, true);
  const r = result.record;
  assert.equal(r.live, true);
  assert.equal(r.status, 200);
  assert.equal(r.bodyText, body);
  assert.equal(r.sizeBytes, byteLength(body));
  assert.equal(r.contentType, 'application/json; charset=utf-8');
  assert.deepEqual(r.headers.find(([k]) => k === 'etag'), ['etag', 'W/"abc"']);
  assert.equal(r.requestHeaders.Accept, 'application/vnd.github+json');
  assert.ok(typeof r.durationMs === 'number' && r.durationMs >= 0);
  assert.ok(r.fetchedAt <= Date.now() && r.fetchedAt > Date.now() - 5000);
});

test('request options never include credentials', async () => {
  const fetchImpl = createFetchMock({ status: 200, body: '{}' });
  await executeEndpoint(endpoint, { fetchImpl });
  const init = fetchImpl.calls[0].init;
  assert.equal(init.credentials, 'omit');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.method, 'GET');
});

test('provider HTTP errors are still real responses (ok: true, status preserved)', async () => {
  const body = loadFixture('github-404.json');
  const fetchImpl = createFetchMock({ status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' }, body });
  const result = await executeEndpoint(endpoint, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.record.status, 404);
  assert.equal(result.record.bodyText, body);
});

test('rate-limit fixture is passed through unchanged', async () => {
  const body = loadFixture('github-ratelimit.json');
  const fetchImpl = createFetchMock({ status: 403, statusText: 'rate limit exceeded', headers: { 'x-ratelimit-remaining': '0' }, body });
  const result = await executeEndpoint(endpoint, { fetchImpl });
  assert.equal(result.record.status, 403);
  assert.deepEqual(result.record.headers.find(([k]) => k === 'x-ratelimit-remaining'), ['x-ratelimit-remaining', '0']);
});

test('non-JSON bodies are preserved verbatim', async () => {
  const body = loadFixture('malformed-body.txt');
  const fetchImpl = createFetchMock({ status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html' }, body });
  const result = await executeEndpoint(endpoint, { fetchImpl });
  assert.equal(result.record.bodyText, body);
  const parsed = tryParseJson(result.record.bodyText);
  assert.equal(parsed.isJson, false);
});

test('network failure returns ok:false with the original error', async () => {
  const result = await executeEndpoint(endpoint, { fetchImpl: failingFetch() });
  assert.equal(result.ok, false);
  assert.ok(result.error instanceof TypeError);
});

test('timeout aborts the request', async () => {
  const fetchImpl = createFetchMock({ status: 200, body: '{}', delayMs: 500 });
  const result = await executeEndpoint(endpoint, { fetchImpl, timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.equal(result.error.name, 'AbortError');
});

test('tryParseJson handles valid, invalid and empty bodies', () => {
  assert.deepEqual(tryParseJson('{"a":1}'), { isJson: true, value: { a: 1 } });
  assert.equal(tryParseJson('{ broken').isJson, false);
  assert.equal(tryParseJson('').isJson, false);
  assert.equal(tryParseJson('   ').isJson, false);
});

test('byteLength counts UTF-8 bytes', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('héllo'), 6);
});
