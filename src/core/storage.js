/**
 * Storage abstraction.
 *
 * GitAPITaker persists only to the browser's localStorage. This wrapper
 * degrades to an in-memory Map when localStorage is unavailable (private
 * browsing modes, blocked storage, tests), and never throws from quota
 * errors — callers receive structured results instead.
 */

/** Minimal key/value storage interface. @typedef {object} KvStorage */

/** @returns {KvStorage} */
function memoryStorage() {
  const map = new Map();
  return {
    kind: 'memory',
    get: (k) => (map.has(k) ? map.get(k) : null),
    set: (k, v) => { map.set(k, v); return true; },
    remove: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
    clearPrefix: (prefix) => { for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k); },
  };
}

/** @returns {KvStorage} */
function localStorageBackend() {
  const ls = globalThis.localStorage;
  return {
    kind: 'localStorage',
    get: (k) => ls.getItem(k),
    set: (k, v) => { try { ls.setItem(k, v); return true; } catch { return false; } },
    remove: (k) => { try { ls.removeItem(k); } catch { /* ignore */ } },
    keys: () => { const out = []; for (let i = 0; i < ls.length; i += 1) out.push(ls.key(i)); return out; },
    clearPrefix: (prefix) => { for (const k of localStorageBackend().keys()) if (k.startsWith(prefix)) ls.removeItem(k); },
  };
}

let active = null;

/** Lazily resolve the storage backend (localStorage if usable, memory otherwise). */
export function getStorage() {
  if (active) return active;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      const probe = 'gitapitaker.__probe__';
      globalThis.localStorage.setItem(probe, '1');
      globalThis.localStorage.removeItem(probe);
      active = localStorageBackend();
      return active;
    }
  } catch { /* fall through to memory */ }
  active = memoryStorage();
  return active;
}

/** Test hook: replace the backend (e.g. with a fake). */
export function setStorageForTests(storage) {
  active = storage;
}

/** Read and JSON-parse one namespaced value; returns null when absent/corrupt. */
export function readJson(key) {
  const raw = getStorage().get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Serialize and write one namespaced value. @returns {boolean} stored */
export function writeJson(key, value) {
  try {
    return getStorage().set(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
