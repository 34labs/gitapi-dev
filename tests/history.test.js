import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setStorageForTests } from '../src/core/storage.js';
import { makeFakeStorage } from './helpers/fake-storage.js';
import { listHistory, addHistory, removeHistory, clearHistory } from '../src/core/history.js';

beforeEach(() => setStorageForTests(makeFakeStorage()));

const entry = (endpoint, extra = {}) => ({
  providerId: 'github', resourceType: 'user', method: 'GET', endpoint, ...extra,
});

test('entries are added newest-first', () => {
  addHistory(entry('https://api.github.com/users/a'));
  addHistory(entry('https://api.github.com/users/b'));
  const list = listHistory();
  assert.equal(list.length, 2);
  assert.equal(list[0].endpoint, 'https://api.github.com/users/b');
  assert.ok(list[0].at >= list[1].at);
});

test('entries are de-duplicated by endpoint and moved to front', () => {
  addHistory(entry('https://api.github.com/users/a', { status: 200 }));
  addHistory(entry('https://api.github.com/users/b'));
  addHistory(entry('https://api.github.com/users/a', { status: 404 }));
  const list = listHistory();
  assert.equal(list.length, 2);
  assert.equal(list[0].endpoint, 'https://api.github.com/users/a');
  assert.equal(list[0].status, 404);
});

test('history is capped at 100 entries', () => {
  for (let i = 0; i < 120; i += 1) addHistory(entry(`https://api.github.com/users/u${i}`));
  assert.equal(listHistory().length, 100);
  assert.equal(listHistory()[0].endpoint, 'https://api.github.com/users/u119');
});

test('remove and clear work', () => {
  addHistory(entry('https://api.github.com/users/a'));
  addHistory(entry('https://api.github.com/users/b'));
  const [first] = listHistory();
  removeHistory(first.id);
  assert.equal(listHistory().length, 1);
  clearHistory();
  assert.equal(listHistory().length, 0);
});

test('history records never store response bodies', () => {
  addHistory(entry('https://api.github.com/users/a', { status: 200, stateLabel: 'LIVE' }));
  const stored = JSON.stringify(listHistory());
  assert.ok(!stored.includes('bodyText'));
  assert.ok(!stored.includes('headers'));
});
