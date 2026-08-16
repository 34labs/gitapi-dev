import { test } from 'node:test';
import assert from 'node:assert/strict';
import { github } from '../src/providers/github.js';
import { ResolverError, ResolverErrorCode } from '../src/core/errors.js';

const ctx = { webBase: github.defaultWebBase, apiBase: github.defaultApiBase };
const resolve = (path) => github.resolve(github.parse(new URL(`https://github.com${path}`), ctx), ctx);

test('github detection', () => {
  assert.equal(github.match(new URL('https://github.com/flessan')), true);
  assert.equal(github.match(new URL('https://gitlab.com/flessan')), false);
});

test('user resolves to /users/{login}', () => {
  const endpoint = resolve('/flessan');
  assert.equal(endpoint.url, 'https://api.github.com/users/flessan');
  assert.equal(endpoint.method, 'GET');
  assert.equal(endpoint.headers.Accept, 'application/vnd.github+json');
  assert.equal(endpoint.headers['X-GitHub-Api-Version'], '2022-11-28');
});

test('organization path resolves to /orgs/{org}', () => {
  assert.equal(resolve('/orgs/nodejs').url, 'https://api.github.com/orgs/nodejs');
});

test('repository resolves to /repos/{owner}/{repo}', () => {
  assert.equal(resolve('/flessan/AdbPureFlow').url, 'https://api.github.com/repos/flessan/AdbPureFlow');
});

test('.git suffix is stripped from repo names', () => {
  assert.equal(resolve('/flessan/AdbPureFlow.git').url, 'https://api.github.com/repos/flessan/AdbPureFlow');
});

test('issue resolves to /repos/{o}/{r}/issues/{n}', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/issues/12').url, 'https://api.github.com/repos/flessan/AdbPureFlow/issues/12');
});

test('pull web path resolves to /pulls/{n} (singular → plural)', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/pull/7').url, 'https://api.github.com/repos/flessan/AdbPureFlow/pulls/7');
});

test('commit and commits paths', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/commit/abc1234').url, 'https://api.github.com/repos/flessan/AdbPureFlow/commits/abc1234');
  assert.equal(resolve('/flessan/AdbPureFlow/commits').url, 'https://api.github.com/repos/flessan/AdbPureFlow/commits');
});

test('releases, release-by-tag and latest release', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/releases').url, 'https://api.github.com/repos/flessan/AdbPureFlow/releases');
  assert.equal(resolve('/flessan/AdbPureFlow/releases/tag/v1.0.0').url, 'https://api.github.com/repos/flessan/AdbPureFlow/releases/tags/v1.0.0');
  assert.equal(resolve('/flessan/AdbPureFlow/releases/latest').url, 'https://api.github.com/repos/flessan/AdbPureFlow/releases/latest');
});

test('branch via /tree/{branch}', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/tree/main').url, 'https://api.github.com/repos/flessan/AdbPureFlow/branches/main');
});

test('tags and branches lists', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/tags').url, 'https://api.github.com/repos/flessan/AdbPureFlow/tags');
  assert.equal(resolve('/flessan/AdbPureFlow/branches').url, 'https://api.github.com/repos/flessan/AdbPureFlow/branches');
});

test('blob resolves to contents with ref query', () => {
  assert.equal(resolve('/flessan/AdbPureFlow/blob/main/README.md').url, 'https://api.github.com/repos/flessan/AdbPureFlow/contents/README.md?ref=main');
});

test('reserved top-level names are not treated as users', () => {
  assert.throws(() => resolve('/features'), (e) => e instanceof ResolverError && e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE);
  assert.throws(() => resolve('/topics'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE);
});

test('homepage is rejected with a hint', () => {
  assert.throws(() => resolve('/'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE && e.hints.length > 0);
});

test('non-numeric issue numbers are rejected', () => {
  assert.throws(() => resolve('/flessan/AdbPureFlow/issues/abc'), (e) => e instanceof ResolverError);
});

test('unmapped repo sections are rejected with docs hint', () => {
  assert.throws(() => resolve('/flessan/AdbPureFlow/wiki'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE);
});

test('tree with a deep path is honestly rejected (ambiguous ref/path)', () => {
  assert.throws(() => resolve('/flessan/AdbPureFlow/tree/main/src/deep'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE);
});

test('related resources for a user include core user endpoints', () => {
  const parsed = github.parse(new URL('https://github.com/flessan'), ctx);
  const urls = github.related(parsed, ctx).map((r) => r.url);
  assert.ok(urls.includes('https://api.github.com/users/flessan/repos'));
  assert.ok(urls.includes('https://api.github.com/users/flessan/followers'));
  assert.ok(urls.includes('https://api.github.com/users/flessan/received_events'));
});

test('related resources for a repo include issues, pulls, commits, releases', () => {
  const parsed = github.parse(new URL('https://github.com/flessan/AdbPureFlow'), ctx);
  const urls = github.related(parsed, ctx).map((r) => r.url);
  assert.ok(urls.includes('https://api.github.com/repos/flessan/AdbPureFlow/issues'));
  assert.ok(urls.includes('https://api.github.com/repos/flessan/AdbPureFlow/pulls'));
  assert.ok(urls.includes('https://api.github.com/repos/flessan/AdbPureFlow/commits'));
  assert.ok(urls.includes('https://api.github.com/repos/flessan/AdbPureFlow/releases'));
});
