/**
 * Endpoint Explorer — keyboard-navigable list of related endpoints derived
 * from provider capability metadata (adapter.related()). Selecting an item
 * inspects that API endpoint directly.
 */

import { el } from './dom.js';
import { rovingList } from './keyboard.js';
import { truncateMiddle } from '../core/format.js';

/**
 * @param {Array<{label: string, url: string, docUrl?: string, resourceType?: string}>} items
 * @param {{onSelect: (item: object) => void}} hooks
 */
export function renderExplorer(items, hooks) {
  const list = el('div', { className: 'explorer-list', role: 'list', 'aria-label': 'Related endpoints' });

  for (const item of items) {
    const inspectBtn = el('button', {
      type: 'button',
      className: 'explorer-inspect',
      tabindex: '-1',
      'aria-label': `${item.label}: inspect ${item.url}`,
    },
    el('span', { className: 'explorer-label' }, item.label),
    el('code', { className: 'explorer-url mono' }, truncateMiddle(item.url, 96)),
    el('span', { className: 'explorer-go', 'aria-hidden': 'true' }, 'inspect'),
    );
    inspectBtn.addEventListener('click', () => hooks.onSelect(item));

    const row = el('div', { className: 'explorer-item', role: 'listitem' }, inspectBtn);
    if (item.docUrl) {
      row.append(el('a', {
        href: item.docUrl, target: '_blank', rel: 'noopener noreferrer', className: 'explorer-doc',
        'aria-label': `Documentation for ${item.label}`,
      }, 'docs'));
    }
    list.append(row);
  }

  rovingList(list, '.explorer-inspect', {
    onActivate: (node) => node.click(),
  });
  return list;
}
