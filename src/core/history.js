/**
 * Request history — local to the browser, never transmitted anywhere.
 * Stores small metadata records only (never bodies or headers).
 */

import { readJson, writeJson } from './storage.js';

const KEY = 'gitapitaker.history.v1';
const MAX_ENTRIES = 100;

/** @returns {import('./types.js').HistoryEntry[]} newest first */
export function listHistory() {
  const value = readJson(KEY);
  return Array.isArray(value) ? value : [];
}

/**
 * Add (or refresh) a history entry. Entries are de-duplicated by endpoint.
 * @param {Partial<import('./types.js').HistoryEntry>} fields
 */
export function addHistory(fields) {
  const entries = listHistory().filter((e) => e.endpoint !== fields.endpoint);
  entries.unshift({
    id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    providerId: fields.providerId ?? 'unknown',
    resourceType: fields.resourceType,
    webUrl: fields.webUrl,
    endpoint: fields.endpoint,
    method: fields.method ?? 'GET',
    status: fields.status,
    stateLabel: fields.stateLabel,
  });
  writeJson(KEY, entries.slice(0, MAX_ENTRIES));
}

/** @param {string} id */
export function removeHistory(id) {
  writeJson(KEY, listHistory().filter((e) => e.id !== id));
}

export function clearHistory() {
  writeJson(KEY, []);
}
