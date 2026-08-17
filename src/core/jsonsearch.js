/**
 * JSON search — pure matching logic used by the JSON viewer.
 * Paths use JSONPath-ish notation: $.key, $.a.b, $.list[0].name
 */

/**
 * Find all paths whose key or primitive value contains the query
 * (case-insensitive substring match).
 *
 * @param {*} value Parsed JSON.
 * @param {string} query
 * @param {{limit?: number}} [opts]
 * @returns {{paths: string[], count: number}}
 */
export function findMatches(value, query, opts = {}) {
  const limit = opts.limit ?? 1000;
  const q = String(query ?? '').trim().toLowerCase();
  const paths = [];
  if (!q) return { paths, count: 0 };
  walk('$', value, q, paths, limit);
  return { paths, count: paths.length };
}

/**
 * True when any match path is inside (or equal to) the given node path.
 * @param {string[]} matchPaths
 * @param {string} nodePath
 */
export function subtreeHasMatch(matchPaths, nodePath) {
  return matchPaths.some((p) =>
    p === nodePath
    || p.startsWith(`${nodePath}.`)
    || p.startsWith(`${nodePath}[`));
}

function walk(path, v, q, paths, limit) {
  if (paths.length >= limit) return;
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i += 1) {
        walk(`${path}[${i}]`, v[i], q, paths, limit);
        if (paths.length >= limit) return;
      }
      return;
    }
    for (const [key, val] of Object.entries(v)) {
      const childPath = `${path}.${key}`;
      if (key.toLowerCase().includes(q)) {
        paths.push(childPath);
        if (paths.length >= limit) return;
      }
      walk(childPath, val, q, paths, limit);
    }
    return;
  }
  const hay = typeof v === 'string' ? v.toLowerCase() : String(v).toLowerCase();
  if (hay.includes(q)) paths.push(path);
}
