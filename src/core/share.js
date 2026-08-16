/**
 * Shareable inspection URLs.
 *
 * A share URL encodes only the instruction "inspect this resource" — the
 * target Git hosting URL. It NEVER contains API responses, tokens or cache
 * data. Opening one performs a normal inspection with the usual Request
 * Guard and cache rules applied.
 *
 * Hash-based (`#/inspect?u=…`) so it works on GitHub Pages repository
 * subpaths without any server cooperation. A top-level `?u=` query is also
 * accepted for convenience.
 */

/**
 * @param {string} targetUrl  The Git hosting URL to inspect.
 * @param {{base?: string}} [opts] Base (origin+path) of the app; defaults to current page.
 */
export function buildShareUrl(targetUrl, opts = {}) {
  const base = opts.base ?? defaultBase();
  return `${base}#/inspect?u=${encodeURIComponent(targetUrl)}`;
}

/**
 * Parse a shareable inspection target out of a hash and/or search string.
 * @param {string} hash   e.g. "#/inspect?u=https%3A%2F%2Fgithub.com%2Fflessan"
 * @param {string} [search] e.g. "?u=..."
 * @returns {string | null} target URL or null
 */
export function parseShareTarget(hash, search = '') {
  const fromHash = parseQueryValue(hashQuery(hash), 'u');
  if (fromHash) return fromHash;
  const fromSearch = parseQueryValue(search.startsWith('?') ? search.slice(1) : search, 'u');
  return fromSearch;
}

/** @param {string} hash @returns {string} */
export function hashRoute(hash) {
  const h = (hash ?? '').replace(/^#/, '');
  const path = h.split('?')[0];
  return path || '/';
}

function hashQuery(hash) {
  const h = (hash ?? '').replace(/^#/, '');
  const idx = h.indexOf('?');
  return idx === -1 ? '' : h.slice(idx + 1);
}

function parseQueryValue(queryString, name) {
  if (!queryString) return null;
  const params = new URLSearchParams(queryString);
  const value = params.get(name);
  if (!value) return null;
  return value;
}

function defaultBase() {
  if (typeof location === 'undefined') return '';
  return location.origin + location.pathname;
}
