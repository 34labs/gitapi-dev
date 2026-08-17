import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCurlCommand, shellQuote } from '../src/core/curl.js';

test('cURL command reflects method, url and headers', () => {
  const cmd = buildCurlCommand({
    method: 'GET',
    url: 'https://api.github.com/users/flessan',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  assert.ok(cmd.startsWith('curl -sS -X GET'));
  assert.ok(cmd.includes("-H 'Accept: application/vnd.github+json'"));
  assert.ok(cmd.includes("-H 'X-GitHub-Api-Version: 2022-11-28'"));
  assert.ok(cmd.endsWith("'https://api.github.com/users/flessan'"));
});

test('cURL output contains no credentials', () => {
  const cmd = buildCurlCommand({ method: 'GET', url: 'https://api.github.com/x', headers: { Accept: 'application/json' } });
  assert.ok(!/authorization/i.test(cmd));
  assert.ok(!/token/i.test(cmd));
});

test('shell quoting escapes single quotes', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
});
