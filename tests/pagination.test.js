import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkHeader, detectPagination, describePagination } from '../src/core/pagination.js';

test('parseLinkHeader extracts rel pairs', () => {
  const link = '<https://api.github.com/users/x/repos?page=2>; rel="next", <https://api.github.com/users/x/repos?page=5>; rel="last"';
  const parsed = parseLinkHeader(link);
  assert.equal(parsed.next, 'https://api.github.com/users/x/repos?page=2');
  assert.equal(parsed.last, 'https://api.github.com/users/x/repos?page=5');
});

test('parseLinkHeader tolerates empty input', () => {
  assert.deepEqual(parseLinkHeader(null), {});
  assert.deepEqual(parseLinkHeader(''), {});
  assert.deepEqual(parseLinkHeader('garbage'), {});
});

test('github Link header produces next/prev urls', () => {
  const p = detectPagination({
    providerId: 'github',
    url: 'https://api.github.com/users/x/repos?page=2',
    headers: [['Link', '<https://api.github.com/users/x/repos?page=3>; rel="next", <https://api.github.com/users/x/repos?page=1>; rel="prev"']],
  });
  assert.equal(p.mode, 'link');
  assert.equal(p.nextUrl, 'https://api.github.com/users/x/repos?page=3');
  assert.equal(p.prevUrl, 'https://api.github.com/users/x/repos?page=1');
});

test('no Link header means no pagination', () => {
  assert.equal(detectPagination({ providerId: 'github', url: 'https://api.github.com/users/x', headers: [] }), null);
});

test('gitlab pagination uses x-* headers and rebuilds the page param', () => {
  const p = detectPagination({
    providerId: 'gitlab',
    url: 'https://gitlab.com/api/v4/projects/1/issues',
    headers: [
      ['x-page', '2'], ['x-next-page', '3'], ['x-prev-page', '1'],
      ['x-total', '128'], ['x-per-page', '20'],
    ],
  });
  assert.equal(p.mode, 'headers');
  assert.equal(p.current, 2);
  assert.equal(p.total, 128);
  assert.equal(p.perPage, 20);
  assert.equal(p.nextUrl, 'https://gitlab.com/api/v4/projects/1/issues?page=3');
  assert.equal(p.prevUrl, 'https://gitlab.com/api/v4/projects/1/issues?page=1');
});

test('gitlab first page has no prev url', () => {
  const p = detectPagination({
    providerId: 'gitlab',
    url: 'https://gitlab.com/api/v4/projects/1/issues',
    headers: [['x-page', '1'], ['x-next-page', '2'], ['x-prev-page', ''], ['x-total', '50']],
  });
  assert.equal(p.prevUrl, null);
  assert.equal(p.nextUrl, 'https://gitlab.com/api/v4/projects/1/issues?page=2');
});

test('gitlab without x-page reports nothing', () => {
  assert.equal(detectPagination({ providerId: 'gitlab', url: 'https://x/api/v4/y', headers: [['x-total', '5']] }), null);
});

test('describePagination only states what is known', () => {
  const gitlab = detectPagination({
    providerId: 'gitlab', url: 'https://x/api/v4/y',
    headers: [['x-page', '1'], ['x-total', '42'], ['x-per-page', '20']],
  });
  assert.equal(describePagination(gitlab), 'page 1 · 42 items total · 20/page');
  const link = detectPagination({ providerId: 'github', url: 'https://x', headers: [['link', '<https://x?p=2>; rel="next"']] });
  assert.equal(describePagination(link), 'provider-supplied page links (Link header)');
  assert.equal(describePagination(null), '');
});
