/**
 * RAW view: the exact response body as returned by Response.text().
 * No beautifying, normalization or reinterpretation. When the body is JSON,
 * the JSON tab shows the parsed/formatted form — this tab stays faithful.
 */

import { el, copyText } from '../ui/dom.js';
import { formatBytes } from '../core/format.js';

/**
 * @param {string} bodyText
 * @param {{sizeBytes?: number, contentType?: string}} [meta]
 */
export function renderRawView(bodyText, meta = {}) {
  const view = el('div', { className: 'raw-view' });
  const note = el('p', { className: 'view-note' },
    'Exact response body as received (decoded as text by the browser). ',
    `Size: ${formatBytes(meta.sizeBytes ?? new TextEncoder().encode(bodyText).length)}.`,
    meta.contentType ? ` Content-Type: ${meta.contentType}.` : '',
  );
  view.append(note);

  if (bodyText === '') {
    view.append(el('p', { className: 'empty-note' }, 'The response body is empty.'));
    return view;
  }

  const pre = el('pre', { className: 'raw-body', tabindex: '0', 'aria-label': 'Raw response body' }, bodyText);
  const copy = el('button', {
    type: 'button', className: 'btn btn-ghost btn-sm',
    onClick: async (e) => {
      const ok = await copyText(bodyText);
      e.target.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { e.target.textContent = 'Copy raw body'; }, 1500);
    },
  }, 'Copy raw body');
  view.append(copy, pre);
  return view;
}
