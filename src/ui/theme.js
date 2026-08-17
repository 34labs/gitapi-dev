/**
 * Color theme: auto (follow OS) / dark / light. Persisted locally,
 * applied via a data attribute — CSS owns the actual palettes.
 */

import { readJson, writeJson } from '../core/storage.js';

const KEY = 'gitapitaker.theme.v1';
export const THEME_ORDER = ['auto', 'dark', 'light'];

/** @returns {'auto'|'dark'|'light'} */
export function getTheme() {
  const t = readJson(KEY);
  return THEME_ORDER.includes(t) ? t : 'auto';
}

/** @param {'auto'|'dark'|'light'} theme */
export function setTheme(theme) {
  writeJson(KEY, theme);
  applyTheme(theme);
}

/** Pure helper: the next theme in the cycle. @param {string} current */
export function nextTheme(current) {
  const idx = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
}

/** @param {'auto'|'dark'|'light'} theme */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return; // Node/test context
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}
