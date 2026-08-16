import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitea } from '../src/providers/gitea.js';
import { ResolverError, ResolverErrorCode } from '../src/core/errors.js';

const ctx = { webBase: gitea.defaultWebBase, apiBase: gitea.defaultApiBase };
const resolve = (path, customCtx = ctx) => gitea.resolve(gitea.parse(new URL(`https://gitea.com${path}`), customCtx), customCtx);

test('gitea detection', () => {
  assert.equal(gitea.match(new URL('https://gitea.com/x')), true);
  assert.equal(gitea.match(new URL('https://github.com/x')), false);
});

test('user resolves to /api/v1/users/{username}', () => {
  assert.equal(resolve('/gitea').url, 'https://gitea.com/api/v1/users/gitea');
});

test('repo resolves to /api/v1/repos/{owner}/{repo}', () => {
  assert.equal(resolve('/gitea/gitea').url, 'https://gitea.com/api/v1/repos/gitea/gitea');
});

test('issue resolves to /api/v1/repos/{o}/{r}/issues/{n}', () => {
  assert.equal(resolve('/gitea/gitea/issues/123').url, 'https://gitea.com/api/v1/repos/gitea/gitea/issues/123');
});

test('pull request resolves to /api/v1/repos/{o}/{r}/pulls/{n}', () => {
  assert.equal(resolve('/gitea/gitea/pulls/9').url, 'https://gitea.com/api/v1/repos/gitea/gitea/pulls/9');
});

test('commit resolves under /git/commits/{sha}', () => {
  assert.equal(resolve('/gitea/gitea/commit/deadbeef').url, 'https://gitea.com/api/v1/repos/gitea/gitea/git/commits/deadbeef');
});

test('release by tag uses the plural /releases/tags/{tag} route', () => {
  assert.equal(resolve('/gitea/gitea/releases/tag/v1.20.0').url, 'https://gitea.com/api/v1/repos/gitea/gitea/releases/tags/v1.20.0');
});

test('latest release route', () => {
  assert.equal(resolve('/gitea/gitea/releases/latest').url, 'https://gitea.com/api/v1/repos/gitea/gitea/releases/latest');
});

test('src/branch/{branch} resolves to branches endpoint', () => {
  assert.equal(resolve('/gitea/gitea/src/branch/main').url, 'https://gitea.com/api/v1/repos/gitea/gitea/branches/main');
});

test('src/branch/{branch}/{path} resolves to contents with ref', () => {
  assert.equal(
    resolve('/gitea/gitea/src/branch/main/README.md').url,
    'https://gitea.com/api/v1/repos/gitea/gitea/contents/README.md?ref=main',
  );
});

test('reserved pages rejected; non-numeric issue rejected', () => {
  assert.throws(() => resolve('/explore'), (e) => e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE);
  assert.throws(() => resolve('/gitea/gitea/issues/xyz'), (e) => e instanceof ResolverError);
});

test('custom API base is honored (self-hosted deployments differ)', () => {
  const customCtx = { webBase: 'https://git.example.org', apiBase: 'https://git.example.org/custom-api/v1' };
  const parsed = gitea.parse(new URL('https://git.example.org/acme/widgets'), customCtx);
  const endpoint = gitea.resolve(parsed, customCtx);
  assert.equal(endpoint.url, 'https://git.example.org/custom-api/v1/repos/acme/widgets');
});

test('related resources for repo include core gitea endpoints', () => {
  const parsed = gitea.parse(new URL('https://gitea.com/gitea/gitea'), ctx);
  const urls = gitea.related(parsed, ctx).map((r) => r.url);
  assert.ok(urls.includes('https://gitea.com/api/v1/repos/gitea/gitea/issues'));
  assert.ok(urls.includes('https://gitea.com/api/v1/repos/gitea/gitea/pulls'));
  assert.ok(urls.includes('https://gitea.com/api/v1/repos/gitea/gitea/releases'));
});
