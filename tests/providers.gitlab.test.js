import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitlab } from '../src/providers/gitlab.js';
import { ResolverError, ResolverErrorCode } from '../src/core/errors.js';

const ctx = { webBase: gitlab.defaultWebBase, apiBase: gitlab.defaultApiBase };
const resolve = (path) => gitlab.resolve(gitlab.parse(new URL(`https://gitlab.com${path}`), ctx), ctx);

test('gitlab detection', () => {
  assert.equal(gitlab.match(new URL('https://gitlab.com/x')), true);
  assert.equal(gitlab.match(new URL('https://github.com/x')), false);
});

test('single segment resolves to /users?username= (NOT a 1:1 URL mapping)', () => {
  const endpoint = resolve('/flessan');
  assert.equal(endpoint.url, 'https://gitlab.com/api/v4/users?username=flessan');
  assert.ok(endpoint.notes.some((n) => n.includes('JSON array')));
});

test('nested group project path is URL-encoded into /projects/{id}', () => {
  const endpoint = resolve('/gitlab-org/gitlab');
  assert.equal(endpoint.url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab');
});

test('deeply nested group paths are preserved', () => {
  assert.equal(
    resolve('/group/subgroup/team/project').url,
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fteam%2Fproject',
  );
});

test('issue via /-/issues/{iid}', () => {
  assert.equal(resolve('/gitlab-org/gitlab/-/issues/42').url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/issues/42');
});

test('merge request via /-/merge_requests/{iid}', () => {
  assert.equal(resolve('/gitlab-org/gitlab/-/merge_requests/100').url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/merge_requests/100');
});

test('commit via /-/commit/{sha}', () => {
  assert.equal(resolve('/gitlab-org/gitlab/-/commit/abc123').url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/abc123');
});

test('release by tag is fully encoded', () => {
  assert.equal(resolve('/gitlab-org/gitlab/-/releases/v1.2.3').url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/releases/v1.2.3');
  assert.equal(resolve('/gitlab-org/gitlab/-/releases/release/1.0').url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/releases/release%2F1.0');
});

test('branch via /-/tree/{branch}', () => {
  assert.equal(resolve('/gitlab-org/gitlab/-/tree/main').url, 'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/branches/main');
});

test('blob resolves to repository/files with ref query', () => {
  assert.equal(
    resolve('/gitlab-org/gitlab/-/blob/master/README.md').url,
    'https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/files/README.md?ref=master',
  );
});

test('reserved site pages are rejected', () => {
  assert.throws(() => resolve('/explore'), (e) => e instanceof ResolverError && e.code === ResolverErrorCode.UNSUPPORTED_RESOURCE);
});

test('missing project before /-/ is rejected', () => {
  assert.throws(() => resolve('/-/issues/1'), (e) => e.code === ResolverErrorCode.MALFORMED_URL);
});

test('related resources are empty for users (needs numeric id) but exist for projects', () => {
  const user = gitlab.parse(new URL('https://gitlab.com/flessan'), ctx);
  assert.deepEqual(gitlab.related(user, ctx), []);

  const project = gitlab.parse(new URL('https://gitlab.com/gitlab-org/gitlab'), ctx);
  const urls = gitlab.related(project, ctx).map((r) => r.url);
  assert.ok(urls.includes('https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/issues'));
  assert.ok(urls.includes('https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/merge_requests'));
});

test('self-hosted context uses the provided apiBase', () => {
  const customCtx = { webBase: 'https://git.example.org', apiBase: 'https://git.example.org/api/v4' };
  const parsed = gitlab.parse(new URL('https://git.example.org/team/project'), customCtx);
  const endpoint = gitlab.resolve(parsed, customCtx);
  assert.equal(endpoint.url, 'https://git.example.org/api/v4/projects/team%2Fproject');
});
