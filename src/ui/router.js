/**
 * Hash-based router — works on GitHub Pages repository subpaths without any
 * server-side routing. Routes:
 *   #/            inspector
 *   #/inspect?u=  inspector + auto-inspect share target
 *   #/history  #/cache  #/providers  #/community  #/about
 */

import { hashRoute, parseShareTarget } from '../core/share.js';

const PAGES = ['inspector', 'history', 'cache', 'providers', 'community', 'about'];

/** Parse the current location into {page, inspectTarget}. */
export function parseLocation() {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  const search = typeof location !== 'undefined' ? location.search : '';
  const route = hashRoute(hash).replace(/^\/+/, '') || 'inspector';
  const page = route === 'inspect' ? 'inspector' : (PAGES.includes(route) ? route : 'inspector');
  const inspectTarget = parseShareTarget(hash, search);
  return { page, inspectTarget };
}

/** @param {{onChange: (state: {page: string, inspectTarget: string|null}) => void}} hooks */
export function createRouter(hooks) {
  const emit = () => hooks.onChange(parseLocation());
  window.addEventListener('hashchange', emit);
  return { emit };
}

/** @param {string} page */
export function navigate(page) {
  const target = page === 'inspector' ? '#/' : `#/${page}`;
  if (location.hash === target) return;
  location.hash = target;
}
