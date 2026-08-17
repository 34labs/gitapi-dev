/**
 * Defensive local cache (localStorage).
 *
 * Purpose: keep the UI responsive and protect third-party APIs from
 * repeated identical requests. It is NEVER used to pretend a response is
 * fresh — every cached response is surfaced as CACHED or STALE.
 *
 * Records keep the full context needed to re-render all four inspector
 * views (JSON / RAW / HEADERS / REQUEST) offline.
 */

import { readJson, writeJson, getStorage } from './storage.js';

export const CACHE_PREFIX = 'gitapitaker.cache.v1.';
export const SNAPSHOT_PREFIX = 'gitapitaker.snapshots.v1.';
/** Freshness window: entries older than this are STALE (still inspectable). */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;
/** Snapshots retained per cache key (for Response Diff). */
export const MAX_SNAPSHOTS = 5;

/**
 * Deterministic cache key. Includes provider + method + full endpoint URL so
 * unrelated requests can never collide. (The endpoint URL already embeds any
 * custom API base, so self-hosted instances are covered too.)
 *
 * @param {string} providerId
 * @param {string} method
 * @param {string} endpointUrl
 */
export function cacheKey(providerId, method, endpointUrl) {
  return `${CACHE_PREFIX}${providerId}:${method}:${fnv1a(`${providerId}|${method}|${endpointUrl}`)}`;
}

/** FNV-1a 32-bit hash — short, deterministic, collision-safe enough for keys. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** @param {string} key @returns {import('./types.js').CacheEntry | null} */
export function readEntry(key) {
  const value = readJson(key);
  if (!value || typeof value !== 'object' || typeof value.bodyText !== 'string') return null;
  return value;
}

/**
 * Persist a response record as a cache entry.
 * @param {string} key
 * @param {import('./types.js').ResponseRecord} record
 * @param {{webUrl?: string, resourceType?: string}} [meta]
 * @returns {import('./types.js').CacheEntry}
 */
export function entryFromRecord(key, record, meta = {}) {
  return {
    key,
    providerId: record.providerId,
    method: record.method,
    endpoint: record.url,
    webUrl: meta.webUrl,
    resourceType: meta.resourceType,
    status: record.status,
    statusText: record.statusText,
    headers: record.headers,
    bodyText: record.bodyText,
    sizeBytes: record.sizeBytes,
    requestHeaders: record.requestHeaders,
    fetchedAt: record.fetchedAt,
    ttlMs: DEFAULT_TTL_MS,
  };
}

/** @param {string} key @param {import('./types.js').CacheEntry} entry @returns {boolean} stored */
export function writeEntry(key, entry) {
  return writeJson(key, entry);
}

/** @param {string} key */
export function deleteEntry(key) {
  getStorage().remove(key);
  getStorage().remove(snapshotKeyOf(key));
}

/** @param {number} [now] @returns {{entry: import('./types.js').CacheEntry, state: 'fresh'|'stale', ageMs: number}[]} */
export function listEntries(now = Date.now()) {
  const out = [];
  for (const k of getStorage().keys()) {
    if (!k.startsWith(CACHE_PREFIX)) continue;
    const entry = readEntry(k);
    if (!entry) continue;
    out.push({ entry, state: entryState(entry, now), ageMs: Math.max(0, now - entry.fetchedAt) });
  }
  out.sort((a, b) => b.entry.fetchedAt - a.entry.fetchedAt);
  return out;
}

/** Delete every cache entry and snapshot list. */
export function clearAll() {
  getStorage().clearPrefix(CACHE_PREFIX);
  getStorage().clearPrefix(SNAPSHOT_PREFIX);
}

/**
 * Freshness of one entry.
 * @param {import('./types.js').CacheEntry} entry
 * @param {number} [now]
 */
export function entryState(entry, now = Date.now()) {
  const ageMs = Math.max(0, now - entry.fetchedAt);
  const ttl = entry.ttlMs ?? DEFAULT_TTL_MS;
  return ageMs <= ttl ? 'fresh' : 'stale';
}

/**
 * Store a live response: archives the previous entry (if any) into the
 * snapshot ring so Response Diff can compare older vs newer truthfully.
 *
 * @param {string} key
 * @param {import('./types.js').ResponseRecord} record
 * @param {{webUrl?: string, resourceType?: string}} [meta]
 * @returns {{entry: import('./types.js').CacheEntry, stored: boolean, archivedPrevious: boolean}}
 */
export function storeLiveResponse(key, record, meta = {}) {
  const previous = readEntry(key);
  let archivedPrevious = false;
  if (previous) {
    const snapshots = listSnapshots(key);
    snapshots.push(previous);
    while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
    archivedPrevious = writeJson(snapshotKeyOf(key), snapshots);
  }
  const entry = entryFromRecord(key, record, meta);
  const stored = writeEntry(key, entry);
  return { entry, stored, archivedPrevious };
}

/** @param {string} key */
export function snapshotKeyOf(cacheKey) {
  return SNAPSHOT_PREFIX + cacheKey.slice(CACHE_PREFIX.length);
}

/** @param {string} key @returns {import('./types.js').CacheEntry[]} oldest → newest */
export function listSnapshots(key) {
  const value = readJson(snapshotKeyOf(key));
  return Array.isArray(value) ? value : [];
}

/**
 * Approximate storage usage of the cache (for the Cache Inspector).
 * @returns {number} bytes of JSON stored under cache+snapshot prefixes
 */
export function approximateUsageBytes() {
  let total = 0;
  for (const k of getStorage().keys()) {
    if (!k.startsWith(CACHE_PREFIX) && !k.startsWith(SNAPSHOT_PREFIX)) continue;
    const v = getStorage().get(k);
    if (v) total += k.length + v.length;
  }
  return total;
}
