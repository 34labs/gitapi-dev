import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInput, endpointFromExplorerItem } from '../src/core/resolver.js';
import { ResolverError, ResolverErrorCode } from '../src/core/errors.js';

test('end-to-end: github.com/flessan -> api.github.com/users/flessan', () => {
  const { endpoint, parsed, provider } = resolveInput('https://github.com/flessan', { instances: [] });
  assert.equal(provider.id, 'github');
  assert.equal(parsed.resourceType, 'user');
  assert.equal(endpoint.url, 'https://api.github.com/users/flessan');
});

test('shorthand input is accepted through the full pipeline', () => {
  const { endpoint } = resolveInput('github.com/flessan/AdbPureFlow', { instances: [] });
  assert.equal(endpoint.url, 'https://api.github.com/repos/flessan/AdbPureFlow');
});

test('issue pipeline', () => {
  const { endpoint, parsed } = resolveInput('https://github.com/flessan/AdbPureFlow/issues/12', { instances: [] });
  assert.equal(parsed.resourceType, 'issue');
  assert.equal(endpoint.url, 'https://api.github.com/repos/flessan/AdbPureFlow/issues/12');
});

test('unsupported provider host is rejected with actionable hints', () => {
  try {
    resolveInput('https://example.com/some/repo', { instances: [] });
    assert.fail('expected ResolverError');
  } catch (err) {
    assert.ok(err instanceof ResolverError);
    assert.equal(err.code, ResolverErrorCode.UNSUPPORTED_PROVIDER);
    assert.ok(err.hints.some((h) => h.includes('Built-in providers')));
    assert.ok(err.hints.some((h) => h.toLowerCase().includes('self-hosted')));
  }
});

test('malformed input is rejected before any provider work', () => {
  assert.throws(() => resolveInput('::not a url::', { instances: [] }), (e) => e instanceof ResolverError);
});

test('empty input produces EMPTY_INPUT', () => {
  assert.throws(() => resolveInput('', { instances: [] }), (e) => e.code === ResolverErrorCode.EMPTY_INPUT);
});

test('registered self-hosted gitea instance is detected by host', () => {
  const instances = [{
    id: 'inst-x', kind: 'gitea', label: 'acme',
    webBase: 'https://git.acme.test', apiBase: 'https://git.acme.test/api/v1',
  }];
  const { endpoint, detection } = resolveInput('https://git.acme.test/team/widgets', { instances });
  assert.equal(endpoint.url, 'https://git.acme.test/api/v1/repos/team/widgets');
  assert.equal(detection.ctx.instanceId, 'inst-x');
});

test('built-in hosts win over instance registration attempts', () => {
  const instances = [{
    id: 'inst-evil', kind: 'gitea', label: 'nope',
    webBase: 'https://github.com', apiBase: 'https://evil.example/api/v1',
  }];
  const { endpoint } = resolveInput('https://github.com/flessan', { instances });
  assert.equal(endpoint.url, 'https://api.github.com/users/flessan');
});

test('endpointFromExplorerItem builds a provider-correct endpoint', () => {
  const { detection } = resolveInput('https://github.com/flessan', { instances: [] });
  const endpoint = endpointFromExplorerItem(
    { url: 'https://api.github.com/users/flessan/repos', label: 'Repos', resourceType: 'repos' },
    detection,
  );
  assert.equal(endpoint.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(endpoint.method, 'GET');
});
