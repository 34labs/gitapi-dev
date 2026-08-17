/**
 * REQUEST view: what GitAPITaker actually requested.
 * Only real information — method, final URL, headers the app sets, and
 * honest notes about what the browser itself controls (User-Agent,
 * credentials). Includes Copy-as-cURL.
 */

import { el, pairsToText, copyText } from '../ui/dom.js';
import { buildCurlCommand } from '../core/curl.js';
import { getProvider } from '../providers/registry.js';

/**
 * @param {import('../core/types.js').ResolvedEndpoint} endpoint
 * @param {{instanceLabel?: string, source?: string}} [meta]
 */
export function renderRequestView(endpoint, meta = {}) {
  const view = el('div', { className: 'request-view' });
  const provider = getProvider(endpoint.providerId);

  const rows = [
    ['Method', endpoint.method || 'GET'],
    ['Final endpoint', endpoint.url],
    ['Provider', provider ? `${provider.name} (${endpoint.providerId})` : endpoint.providerId],
  ];
  if (meta.instanceLabel) rows.push(['Instance', meta.instanceLabel]);
  if (endpoint.apiBase) rows.push(['API base', endpoint.apiBase]);
  rows.push(['Request source', meta.source ?? 'URL inspection']);
  if (provider?.apiInfo?.versionLabel) rows.push(['API version', provider.apiInfo.versionLabel]);

  const dl = el('dl', { className: 'kv-list' });
  for (const [k, v] of rows) {
    dl.append(el('dt', {}, k), el('dd', { className: 'mono' }, v));
  }
  view.append(dl);

  const headerEntries = Object.entries(endpoint.headers ?? {});
  view.append(el('h3', { className: 'view-subhead' }, 'Request headers set by GitAPITaker'));
  if (headerEntries.length === 0) {
    view.append(el('p', { className: 'empty-note' }, 'No custom headers are set for this provider.'));
  } else {
    view.append(el('pre', { className: 'raw-body raw-body-sm', tabindex: '0', 'aria-label': 'Request headers' }, pairsToText(headerEntries)));
  }

  const honesty = el('ul', { className: 'note-list' });
  honesty.append(
    el('li', {}, 'User-Agent is controlled by the browser and cannot be set from a web page.'),
    el('li', {}, 'Credentials mode is "omit": no cookies or stored credentials are sent to provider APIs.'),
    el('li', {}, 'The request goes directly from this browser to the provider. GitAPITaker operates no proxy.'),
    el('li', {}, 'GitAPITaker v0.1 performs unauthenticated requests; no tokens are ever attached, stored or shared.'),
  );
  view.append(el('h3', { className: 'view-subhead' }, 'Browser-managed details'), honesty);

  if (endpoint.docUrl) {
    view.append(el('p', {},
      el('a', { href: endpoint.docUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Official documentation for this endpoint'),
    ));
  }

  const curl = buildCurlCommand(endpoint);
  const curlSection = el('div', { className: 'curl-block' },
    el('h3', { className: 'view-subhead' }, 'Copy as cURL'),
    el('pre', { className: 'raw-body raw-body-sm', tabindex: '0', 'aria-label': 'cURL command' }, curl),
    el('button', {
      type: 'button', className: 'm3-btn tonal btn-sm',
      onClick: async (e) => {
        const ok = await copyText(curl);
        e.target.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => { e.target.textContent = 'Copy cURL'; }, 1500);
      },
    }, 'Copy cURL'),
    el('p', { className: 'view-note' }, 'Represents exactly what GitAPITaker sends. No credentials are included.'),
  );
  view.append(curlSection);
  return view;
}
