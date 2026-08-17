/**
 * Cache Inspector page: transparent view into the localStorage cache.
 * Shows every stored entry with metadata and honest freshness state, and
 * offers inspect / refresh / delete / clear-all controls.
 */

import { el, clear } from './dom.js';
import { listEntries, deleteEntry, clearAll, approximateUsageBytes } from '../core/cache.js';
import { formatBytes, formatAge, formatTimestamp } from '../core/format.js';
import { truncateMiddle } from '../core/format.js';
import { announce } from './announce.js';

/**
 * @param {{
 *   onInspectEntry: (entry: import('../core/types.js').CacheEntry, state: string) => void,
 *   onRefreshEntry: (entry: import('../core/types.js').CacheEntry) => void,
 * }} hooks
 */
export function renderCacheView(hooks) {
  const container = document.getElementById('page-cache');
  const mount = container.querySelector('#cache-list');
  const summary = container.querySelector('#cache-summary');
  clear(mount);

  const entries = listEntries();
  const usage = approximateUsageBytes();
  summary.textContent = entries.length
    ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · approx. ${formatBytes(usage)} of localStorage · nothing here ever leaves this browser.`
    : `Cache is empty. Responses are stored here only after a live request. (¬_¬)`;

  if (entries.length === 0) return;

  const table = el('table', { className: 'm3-table cache-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, 'Endpoint'),
      el('th', { scope: 'col' }, 'Provider'),
      el('th', { scope: 'col' }, 'Status'),
      el('th', { scope: 'col' }, 'Fetched'),
      el('th', { scope: 'col' }, 'Freshness'),
      el('th', { scope: 'col' }, 'Size'),
      el('th', { scope: 'col' }, 'Actions'),
    )),
  );
  const tbody = el('tbody');
  table.append(tbody);

  for (const { entry, state } of entries) {
    const actions = el('td', { className: 'cache-actions' },
      el('button', { type: 'button', className: 'm3-btn tonal btn-sm', 'aria-label': `Inspect cached response for ${entry.endpoint}` }, 'Inspect'),
      el('button', { type: 'button', className: 'm3-btn tonal btn-sm', 'aria-label': `Request ${entry.endpoint} live and update the cache` }, 'Refresh'),
      el('button', { type: 'button', className: 'm3-btn text btn-sm btn-danger', 'aria-label': `Delete cached entry for ${entry.endpoint}` }, 'Delete'),
    );
    const [inspectBtn, refreshBtn, deleteBtn] = actions.querySelectorAll('button');
    inspectBtn.addEventListener('click', () => hooks.onInspectEntry(entry, state));
    refreshBtn.addEventListener('click', () => hooks.onRefreshEntry(entry));
    deleteBtn.addEventListener('click', () => {
      deleteEntry(entry.key);
      renderCacheView(hooks);
      announce('Cache entry deleted.');
    });

    tbody.append(el('tr', {},
      el('td', { className: 'mono', title: entry.endpoint }, truncateMiddle(entry.endpoint, 64)),
      el('td', {}, entry.providerId),
      el('td', { className: 'mono' }, String(entry.status)),
      el('td', { className: 'mono', title: formatTimestamp(entry.fetchedAt) }, formatAge(entry.fetchedAt)),
      el('td', {}, el('span', { className: `m3-chip chip-${state === 'fresh' ? 'cached' : 'stale'}` },
        el('span', { className: 'state-dot', 'aria-hidden': 'true' }), state === 'fresh' ? 'FRESH' : 'STALE')),
      el('td', { className: 'mono' }, formatBytes(entry.sizeBytes)),
      actions,
    ));
  }
  mount.append(table);
  mount.append(el('p', { className: 'view-note' },
    'Fresh entries are younger than their TTL and will be served by the Request Guard when you repeat a request. ',
    'Stale entries are still inspectable (offline mode) but are always labeled STALE — never presented as fresh.'));
}

/** Wire the "clear cache" button once at boot. */
export function initCacheView() {
  document.getElementById('cache-clear').addEventListener('click', () => {
    clearAll();
    announce('Local cache cleared.');
    document.dispatchEvent(new CustomEvent('gitapitaker:cache-changed'));
  });
}
