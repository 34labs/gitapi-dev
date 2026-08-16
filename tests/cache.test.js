import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setStorageForTests } from '../src/core/storage.js';
import { makeFakeStorage } from './helpers/fake-storage.js';
import {
  cacheKey, fnv1a, readEntry, storeLiveResponse, listEntries, entryState,
  deleteEntry, clearAll, listSnapshots, DEFAULT_TTL_MS, MAX_SNAPSHOTS,
} from '../src/core/cache.js';

function fakeRecord(overrides = {}) {
  return {
    live: true, method: 'GET', url: 'https://api.github.com/users/flessan', providerId: 'github',
    status: 200, statusText: 'OK', headers: [['content-type', 'application/json']],
    bodyText: '{"login":"flessan"}', sizeBytes: 19, durationMs: 120, fetchedAt: Date.now(),
    requestHeaders: { Accept: 'application/vnd.github+json' },
    ...overrides,
  };
}

beforeEach(() => setStorageForTests(makeFakeStorage()));

test('cache keys include provider, method and endpoint context', () => {
  const a = cacheKey('github', 'GET', 'https://api.github.com/users/flessan');
  const b = cacheKey('github', 'GET', 'https://api.github.com/users/other');
  const c = cacheKey('gitlab', 'GET', 'https://api.github.com/users/flessan');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(a, cacheKey('github', 'GET', 'https://api.github.com/users/flessan'));
});

test('fnv1a is deterministic and distinct', () => {
  assert.equal(fnv1a('abc'), fnv1a('abc'));
  assert.notEqual(fnv1a('abc'), fnv1a('abd'));
});

test('storeLiveResponse persists a complete entry', () => {
  const key = cacheKey('github', 'GET', 'https://api.github.com/users/flessan');
  const record = fakeRecord();
  const { entry, stored } = storeLiveResponse(key, record, { webUrl: 'https://github.com/flessan', resourceType: 'user' });
  assert.ok(stored);
  const read = readEntry(key);
  assert.equal(read.endpoint, record.url);
  assert.equal(read.status, 200);
  assert.equal(read.bodyText, record.bodyText);
  assert.equal(read.webUrl, 'https://github.com/flessan');
  assert.equal(read.ttlMs, DEFAULT_TTL_MS);
  assert.equal(read.requestHeaders.Accept, 'application/vnd.github+json');
  assert.equal(entry.key, key);
});

test('previous entry is archived as a snapshot on replacement', () => {
  const key = cacheKey('github', 'GET', 'https://api.github.com/users/flessan');
  storeLiveResponse(key, fakeRecord({ bodyText: '{"v":1}' }));
  storeLiveResponse(key, fakeRecord({ bodyText: '{"v":2}' }));
  const snapshots = listSnapshots(key);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].bodyText, '{"v":1}');
});

test('snapshot ring is capped', () => {
  const key = cacheKey('github', 'GET', 'https://api.github.com/x');
  for (let i = 0; i <= MAX_SNAPSHOTS + 2; i += 1) {
    storeLiveResponse(key, fakeRecord({ bodyText: `{"v":${i}}` }));
  }
  assert.equal(listSnapshots(key).length, MAX_SNAPSHOTS);
});

test('entryState distinguishes fresh from stale by TTL', () => {
  const now = Date.now();
  const fresh = fakeRecord({ fetchedAt: now - 1000 });
  const stale = fakeRecord({ fetchedAt: now - DEFAULT_TTL_MS - 1000 });
  assert.equal(entryState(fresh, now), 'fresh');
  assert.equal(entryState(stale, now), 'stale');
});

test('listEntries returns sorted entries with state', () => {
  storeLiveResponse(cacheKey('github', 'GET', 'https://api.github.com/a'), fakeRecord({ fetchedAt: Date.now() - 1000 }));
  storeLiveResponse(cacheKey('github', 'GET', 'https://api.github.com/b'), fakeRecord({ fetchedAt: Date.now() }));
  const entries = listEntries();
  assert.equal(entries.length, 2);
  assert.ok(entries[0].entry.fetchedAt >= entries[1].entry.fetchedAt);
  assert.ok(['fresh', 'stale'].includes(entries[0].state));
});

test('deleteEntry removes entry and its snapshots', () => {
  const key = cacheKey('github', 'GET', 'https://api.github.com/users/flessan');
  storeLiveResponse(key, fakeRecord());
  storeLiveResponse(key, fakeRecord({ bodyText: '2' }));
  deleteEntry(key);
  assert.equal(readEntry(key), null);
  assert.deepEqual(listSnapshots(key), []);
});

test('clearAll wipes cache and snapshots', () => {
  storeLiveResponse(cacheKey('github', 'GET', 'https://api.github.com/a'), fakeRecord());
  clearAll();
  assert.deepEqual(listEntries(), []);
});
