/**
 * History page: local inspection history with keyboard navigation.
 * Entries are small metadata records; reopening re-runs the inspection.
 */

import { el, clear } from './dom.js';
import { listHistory, removeHistory, clearHistory } from '../core/history.js';
import { rovingList } from './keyboard.js';
import { formatAge, truncateMiddle } from '../core/format.js';
import { announce } from './announce.js';

let reopenHook = () => {};

/** Wire the page once at boot. @param {{onReopen: (entry: import('../core/types.js').HistoryEntry) => void}} hooks */
export function initHistory(hooks) {
  reopenHook = hooks.onReopen;
  document.getElementById('history-clear').addEventListener('click', () => {
    clearHistory();
    renderHistoryView();
    announce('History cleared.');
  });
}

/** Re-render the history list. */
export function renderHistoryView() {
  const container = document.getElementById('page-history');
  const listMount = container.querySelector('#history-list');
  const summary = container.querySelector('#history-summary');
  clear(listMount);

  const entries = listHistory();
  summary.textContent = entries.length
    ? `${entries.length} local entr${entries.length === 1 ? 'y' : 'ies'} — stored in this browser only, never transmitted.`
    : '';

  if (entries.length === 0) {
    listMount.append(el('p', { className: 'empty-note' }, 'No inspections yet. History is local to this browser. (・_・;)'));
    return;
  }

  for (const entry of entries) {
    const row = el('div', { className: 'history-row', dataset: { id: entry.id } },
      el('button', {
        type: 'button', className: 'history-main', tabindex: '-1',
        'aria-label': `Reopen inspection of ${entry.endpoint}, ${entry.providerId}, ${formatAge(entry.at)}`,
      },
      el('span', { className: 'chip chip-provider' }, entry.providerId),
      entry.resourceType ? el('span', { className: 'chip chip-muted mono' }, entry.resourceType) : null,
      el('code', { className: 'history-endpoint mono' }, truncateMiddle(entry.endpoint, 90)),
      el('span', { className: 'history-meta mono' },
        `${formatAge(entry.at)}${entry.status ? ` · HTTP ${entry.status}` : ''}${entry.stateLabel ? ` · ${entry.stateLabel}` : ''}`),
      ),
      el('button', {
        type: 'button', className: 'btn btn-ghost btn-sm history-remove', 'aria-label': `Remove history entry for ${entry.endpoint}`,
      }, 'Remove'),
    );
    row.querySelector('.history-main').addEventListener('click', () => reopenHook(entry));
    row.querySelector('.history-remove').addEventListener('click', () => {
      removeHistory(entry.id);
      renderHistoryView();
      announce('History entry removed.');
    });
    listMount.append(row);
  }

  rovingList(listMount, '.history-main', {
    onActivate: (node) => {
      const id = node.closest('.history-row')?.dataset.id;
      const entry = listHistory().find((e) => e.id === id);
      if (entry) reopenHook(entry);
    },
  });
}
