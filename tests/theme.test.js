import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setStorageForTests } from '../src/core/storage.js';
import { makeFakeStorage } from './helpers/fake-storage.js';
import { nextTheme, getTheme, setTheme, THEME_ORDER } from '../src/ui/theme.js';

beforeEach(() => setStorageForTests(makeFakeStorage()));

test('nextTheme cycles auto -> dark -> light -> auto', () => {
  assert.equal(nextTheme('auto'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'auto');
});

test('default theme is auto', () => {
  assert.equal(getTheme(), 'auto');
});

test('setTheme persists', () => {
  setTheme('dark');
  assert.equal(getTheme(), 'dark');
});

test('corrupt stored value falls back to auto', () => {
  setStorageForTests({ ...makeFakeStorage(), get: () => '"neon"' });
  assert.equal(getTheme(), 'auto');
  assert.ok(THEME_ORDER.includes(getTheme()));
});
