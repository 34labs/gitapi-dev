/** Map-backed storage implementing the KvStorage interface, for tests. */
export function makeFakeStorage() {
  const map = new Map();
  return {
    kind: 'memory',
    get: (k) => (map.has(k) ? map.get(k) : null),
    set: (k, v) => { map.set(k, String(v)); return true; },
    remove: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
    clearPrefix: (prefix) => { for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k); },
  };
}
