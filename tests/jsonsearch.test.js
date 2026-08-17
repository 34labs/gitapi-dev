import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, subtreeHasMatch } from '../src/core/jsonsearch.js';

const sample = {
  login: 'flessan',
  id: 101234567,
  public_repos: 4,
  nested: { owner: 'someone', tags: ['dns', 'lists'] },
};

test('matches keys case-insensitively', () => {
  const { paths } = findMatches(sample, 'LOGIN');
  assert.deepEqual(paths, ['$.login']);
});

test('matches string values', () => {
  const { paths } = findMatches(sample, 'flessan');
  assert.ok(paths.includes('$.login'));
});

test('matches inside arrays with bracket paths', () => {
  const { paths } = findMatches(sample, 'dns');
  assert.deepEqual(paths, ['$.nested.tags[0]']);
});

test('matches numeric values via string form', () => {
  const { paths } = findMatches(sample, '101234567');
  assert.ok(paths.includes('$.id'));
});

test('key match reports the key path, value matches report their own', () => {
  const { paths } = findMatches(sample, 'owner');
  assert.ok(paths.includes('$.nested.owner'));
});

test('empty query matches nothing', () => {
  assert.deepEqual(findMatches(sample, '   ').paths, []);
});

test('results are capped', () => {
  const big = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`hit${i}`, 'x']));
  const { paths, count } = findMatches(big, 'hit', { limit: 10 });
  assert.equal(paths.length, 10);
  assert.equal(count, 10);
});

test('subtreeHasMatch covers nested membership', () => {
  const matches = ['$.nested.tags[0]', '$.login'];
  assert.equal(subtreeHasMatch(matches, '$.nested'), true);
  assert.equal(subtreeHasMatch(matches, '$.nested.tags'), true);
  assert.equal(subtreeHasMatch(matches, '$.login'), true);
  assert.equal(subtreeHasMatch(matches, '$.other'), false);
  assert.equal(subtreeHasMatch(matches, '$'), true);
});
