import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareUrl, parseShareTarget, hashRoute } from '../src/core/share.js';

test('buildShareUrl encodes only the inspection instruction', () => {
  const url = buildShareUrl('https://github.com/flessan', { base: 'https://user.github.io/gitapi-dev/' });
  assert.equal(url, 'https://user.github.io/gitapi-dev/#/inspect?u=https%3A%2F%2Fgithub.com%2Fflessan');
});

test('share URLs work from repository subpaths', () => {
  const url = buildShareUrl('https://gitlab.com/gitlab-org/gitlab', { base: 'https://example.com/deep/sub/path/' });
  assert.ok(url.startsWith('https://example.com/deep/sub/path/#/inspect?u='));
});

test('share URLs never embed response data', () => {
  const url = buildShareUrl('https://github.com/flessan');
  assert.ok(!url.includes('body'));
  assert.ok(!url.includes('token'));
  assert.ok(!url.includes('status'));
});

test('parseShareTarget round-trips hash URLs', () => {
  const target = 'https://github.com/flessan/AdbPureFlow/issues/12';
  const share = buildShareUrl(target, { base: '' });
  const hash = share.slice(share.indexOf('#'));
  assert.equal(parseShareTarget(hash), target);
});

test('parseShareTarget accepts top-level query form', () => {
  assert.equal(parseShareTarget('', '?u=https%3A%2F%2Fgitea.com%2Fgitea%2Fgitea'), 'https://gitea.com/gitea/gitea');
});

test('parseShareTarget returns null when no target present', () => {
  assert.equal(parseShareTarget('#/history'), null);
  assert.equal(parseShareTarget('', ''), null);
});

test('hashRoute parses pages', () => {
  assert.equal(hashRoute('#/'), '/');
  assert.equal(hashRoute('#/history'), '/history');
  assert.equal(hashRoute(''), '/');
  assert.equal(hashRoute('#/inspect?u=x'), '/inspect');
});
