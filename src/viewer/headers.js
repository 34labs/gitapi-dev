/**
 * HEADERS view: the response headers exactly as the browser exposed them.
 * Browsers only expose CORS-safelisted response headers plus headers the
 * provider lists in Access-Control-Expose-Headers — this view says so
 * instead of pretending the list is complete when it cannot know.
 */

import { el, pairsToText, copyText } from '../ui/dom.js';

/** @param {Array<[string, string]>} headers */
export function renderHeadersView(headers) {
  const view = el('div', { className: 'headers-view' });
  const list = headers ?? [];

  view.append(el('p', { className: 'view-note' },
    `${list.length} header${list.length === 1 ? '' : 's'} exposed by the browser. `,
    'Browsers hide response headers unless they are CORS-safelisted or listed in Access-Control-Expose-Headers; the provider may have sent more.',
  ));

  if (list.length === 0) {
    view.append(el('p', { className: 'empty-note' }, 'No response headers were exposed for this response.'));
    return view;
  }

  const filter = el('input', {
    type: 'search', className: 'input headers-filter', placeholder: 'Filter headers (e.g. etag, rate, cache)',
    'aria-label': 'Filter response headers',
  });
  const tbody = el('tbody');
  const table = el('table', { className: 'kv-table' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Header'), el('th', { scope: 'col' }, 'Value'))),
    tbody,
  );

  const rows = [...list].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, value] of rows) {
    tbody.append(el('tr', {},
      el('th', { scope: 'row', className: 'mono' }, name),
      el('td', { className: 'mono kv-value' }, value),
    ));
  }

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    for (const tr of tbody.querySelectorAll('tr')) {
      const name = tr.querySelector('th')?.textContent.toLowerCase() ?? '';
      const value = tr.querySelector('td')?.textContent.toLowerCase() ?? '';
      tr.hidden = q !== '' && !name.includes(q) && !value.includes(q);
    }
  });

  const copy = el('button', {
    type: 'button', className: 'm3-btn tonal btn-sm',
    onClick: async (e) => {
      const ok = await copyText(pairsToText(rows));
      e.target.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { e.target.textContent = 'Copy headers'; }, 1500);
    },
  }, 'Copy headers');

  view.append(filter, copy, table);
  return view;
}
