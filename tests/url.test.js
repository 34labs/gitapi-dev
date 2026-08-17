import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, joinUrl, encodeFully, encodePathKeepingSlashes, parseBaseUrl } from '../src/core/url.js';
import { ResolverError, ResolverErrorCode } from '../src/core/errors.js';

test('normalizeInput accepts full URLs', () => {
  assert.equal(normalizeInput('https://github.com/flessan').toString(), 'https://github.com/flessan');
});

test('normalizeInput accepts shorthand host/path', () => {
  assert.equal(normalizeInput('github.com/flessan').toString(), 'https://github.com/flessan');
});

test('normalizeInput strips www, trailing slashes, query and hash', () => {
  assert.equal(normalizeInput('www.github.com/flessan/').toString(), 'https://github.com/flessan');
  assert.equal(normalizeInput('https://github.com/flessan?tab=repos#readme').toString(), 'https://github.com/flessan');
});

test('normalizeInput upgrades http to https', () => {
  assert.equal(normalizeInput('http://gitlab.com/foo').toString(), 'https://gitlab.com/foo');
});

test('normalizeInput accepts git@ SSH remote form', () => {
  assert.equal(normalizeInput('git@github.com:flessan/AdbPureFlow.git').toString(), 'https://github.com/flessan/AdbPureFlow.git');
});

test('normalizeInput rejects empty input', () => {
  assert.throws(() => normalizeInput('   '), (e) => e instanceof ResolverError && e.code === ResolverErrorCode.EMPTY_INPUT);
});

test('normalizeInput rejects hostless input', () => {
  assert.throws(() => normalizeInput('flessan'), (e) => e.code === ResolverErrorCode.MALFORMED_URL);
});

test('normalizeInput rejects unsupported schemes', () => {
  assert.throws(() => normalizeInput('ftp://github.com/x'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_SCHEME);
  assert.throws(() => normalizeInput('javascript:alert(1)'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_SCHEME);
});

test('normalizeInput rejects invalid URLs', () => {
  assert.throws(() => normalizeInput('https://[::nope'), (e) => e.code === ResolverErrorCode.MALFORMED_URL);
});

test('joinUrl joins encoded segments', () => {
  assert.equal(joinUrl('https://api.github.com', ['repos', 'a b', 'c']), 'https://api.github.com/repos/a%20b/c');
});

test('encoding helpers', () => {
  assert.equal(encodeFully('group/sub/project'), 'group%2Fsub%2Fproject');
  assert.equal(encodePathKeepingSlashes('release/v1.0'), 'release/v1.0');
  assert.equal(encodePathKeepingSlashes('a b/c'), 'a%20b/c');
});

test('parseBaseUrl validates bases', () => {
  assert.equal(parseBaseUrl('https://git.example.org').origin, 'https://git.example.org');
  assert.equal(parseBaseUrl('not a url'), null);
  assert.equal(parseBaseUrl('ftp://x.y'), null);
  assert.equal(parseBaseUrl(''), null);
});
