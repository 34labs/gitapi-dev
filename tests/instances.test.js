import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setStorageForTests } from '../src/core/storage.js';
import { makeFakeStorage } from './helpers/fake-storage.js';
import { listInstances, addInstance, removeInstance, probeInstance, clearInstancesForTests } from '../src/providers/instances.js';
import { ResolverError, ResolverErrorCode } from '../src/core/errors.js';
import { createFetchMock } from './helpers/mock-fetch.js';

beforeEach(() => {
  setStorageForTests(makeFakeStorage());
  clearInstancesForTests();
});

test('gitea instance gets default /api/v1 base', () => {
  const inst = addInstance({ kind: 'gitea', webBase: 'https://git.acme.test' });
  assert.equal(inst.apiBase, 'https://git.acme.test/api/v1');
  assert.equal(listInstances().length, 1);
});

test('gitlab instance gets default /api/v4 base', () => {
  const inst = addInstance({ kind: 'gitlab', webBase: 'https://gl.acme.test' });
  assert.equal(inst.apiBase, 'https://gl.acme.test/api/v4');
});

test('custom API base is honored and normalized', () => {
  const inst = addInstance({ kind: 'gitea', webBase: 'https://git.acme.test', apiBase: 'https://git.acme.test/custom/v1/' });
  assert.equal(inst.apiBase, 'https://git.acme.test/custom/v1');
});

test('invalid URLs are rejected', () => {
  assert.throws(() => addInstance({ kind: 'gitea', webBase: 'nope' }), (e) => e instanceof ResolverError && e.code === ResolverErrorCode.INVALID_INSTANCE);
  assert.throws(() => addInstance({ kind: 'gitea', webBase: 'https://ok.test', apiBase: '???' }), (e) => e.code === ResolverErrorCode.INVALID_INSTANCE);
});

test('built-in provider hosts cannot be overridden', () => {
  assert.throws(() => addInstance({ kind: 'gitea', webBase: 'https://github.com' }), (e) => e.code === ResolverErrorCode.INVALID_INSTANCE);
  assert.throws(() => addInstance({ kind: 'gitlab', webBase: 'https://gitlab.com' }), (e) => e.code === ResolverErrorCode.INVALID_INSTANCE);
});

test('unknown kinds are rejected', () => {
  assert.throws(() => addInstance({ kind: 'bitbucket', webBase: 'https://bb.test' }), (e) => e instanceof ResolverError);
});

test('re-adding a host replaces the previous entry', () => {
  addInstance({ kind: 'gitea', webBase: 'https://git.acme.test', label: 'old' });
  addInstance({ kind: 'gitea', webBase: 'https://git.acme.test/', label: 'new' });
  const list = listInstances();
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'new');
});

test('removeInstance deletes', () => {
  const inst = addInstance({ kind: 'gitea', webBase: 'https://git.acme.test' });
  removeInstance(inst.id);
  assert.equal(listInstances().length, 0);
});

test('probeInstance: gitea version endpoint success', async () => {
  const inst = addInstance({ kind: 'gitea', webBase: 'https://git.acme.test' });
  const fetchImpl = createFetchMock({ status: 200, body: '{"version":"1.22.1"}' });
  const probe = await probeInstance(inst, fetchImpl);
  assert.equal(probe.ok, true);
  assert.ok(probe.detail.includes('1.22.1'));
  assert.equal(fetchImpl.calls[0].url, 'https://git.acme.test/api/v1/version');
});

test('probeInstance: gitlab 401 still confirms the API exists', async () => {
  const inst = addInstance({ kind: 'gitlab', webBase: 'https://gl.acme.test' });
  const fetchImpl = createFetchMock({ status: 401, body: '{"message":"401 Unauthorized"}' });
  const probe = await probeInstance(inst, fetchImpl);
  assert.equal(probe.ok, true);
  assert.equal(probe.status, 401);
});

test('probeInstance: unreachable instance is reported honestly', async () => {
  const inst = addInstance({ kind: 'gitea', webBase: 'https://git.acme.test' });
  const probe = await probeInstance(inst, createFetchMock({ error: new TypeError('Failed to fetch') }));
  assert.equal(probe.ok, false);
  assert.equal(probe.status, null);
  assert.ok(probe.detail.includes('unreachable') || probe.detail.includes('CORS'));
});
