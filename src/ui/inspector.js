/**
 * Inspector page presentation: input form, status bar, interpretation
 * banner, the four response views (JSON / RAW / HEADERS / REQUEST) and the
 * endpoint explorer mount. All inspection *logic* lives in core modules;
 * this file only renders state.
 */

import { el, clear, copyText } from './dom.js';
import { createTabs } from './tabs.js';
import { announce } from './announce.js';
import { renderJsonTree } from '../viewer/json.js';
import { renderRawView } from '../viewer/raw.js';
import { renderHeadersView } from '../viewer/headers.js';
import { renderRequestView } from '../viewer/request.js';
import { tryParseJson } from '../core/request.js';
import { formatBytes, formatDuration, formatAge } from '../core/format.js';
import { interpretHttpStatus } from '../core/errors.js';
import { renderExplorer } from './explorer.js';
import { buildShareUrl } from '../core/share.js';

const EXAMPLES = [
  'https://github.com/flessan',
  'https://github.com/flessan/AdbPureFlow',
  'https://github.com/flessan/AdbPureFlow/issues/12',
  'https://gitlab.com/gitlab-org/gitlab',
  'https://gitea.com/gitea/gitea',
];

let tabsInstance = null;

/** Wire the input form. @param {{onInspect: (value: string) => void}} hooks */
export function initInspector(hooks) {
  const form = document.getElementById('inspect-form');
  const input = document.getElementById('url-input');
  const examples = document.getElementById('examples');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    hooks.onInspect(input.value);
  });

  for (const example of EXAMPLES) {
    const btn = el('button', { type: 'button', className: 'example-chip mono', title: `Inspect ${example}` }, example.replace('https://', ''));
    btn.addEventListener('click', () => {
      input.value = example;
      hooks.onInspect(example);
    });
    examples.append(btn);
  }
}

export function focusInput() {
  const input = document.getElementById('url-input');
  input.focus();
  input.select();
}

export function getInputValue() {
  return document.getElementById('url-input').value;
}

export function setInputValue(value) {
  document.getElementById('url-input').value = value;
}

/** Hide result sections, show a waiting state. */
export function showPending(endpoint) {
  toggle('empty-state', false);
  toggle('resolver-error', false);
  toggle('result-area', true);
  toggle('pending-note', true);
  clear(document.getElementById('status-bar'));
  clear(document.getElementById('response-tabs'));
  document.getElementById('status-bar').append(
    stateChip('pending'),
    el('code', { className: 'endpoint mono' }, endpoint.url),
  );
  hideInterpretation();
  toggle('explorer-area', false);
  announce(`Requesting ${endpoint.url} directly from the provider.`);
}

/**
 * The request never produced a response and no cached fallback exists.
 * Rendered as an honest error panel — never as a fake result.
 * @param {{endpoint: object, providerName: string, failure: {title: string, causes: string[], actions: string[]}}} args
 */
export function showNetworkError({ endpoint, providerName, failure }) {
  toggle('result-area', false);
  toggle('pending-note', false);
  toggle('empty-state', false);
  const box = document.getElementById('resolver-error');
  clear(box);
  box.hidden = false;
  box.append(
    el('h2', {}, 'The provider could not be reached'),
    el('p', { className: 'mono error-code' }, 'network-error'),
    el('p', {}, failure.title),
    el('ul', { className: 'hint-list' }, failure.causes.map((c) => el('li', {}, c))),
    el('p', {}, el('strong', {}, 'What you can do: ')),
    el('ul', { className: 'hint-list' }, failure.actions.map((a) => el('li', {}, a))),
    el('p', { className: 'view-note' },
      `Attempted: GET ${endpoint.url} (${providerName}). No response was received, so no response data is shown.`,
      ' If a cached copy exists, it is available in the Cache inspector.'),
  );
  announce(`Request failed: ${failure.title}`, { assertive: true });
}

/**
 * Render a finished inspection.
 * @param {{
 *   endpoint: import('../core/types.js').ResolvedEndpoint,
 *   providerName: string,
 *   data: {status: number, statusText: string, headers: Array<[string,string]>, bodyText: string, sizeBytes: number, contentType?: string, durationMs?: number, fetchedAt: number},
 *   state: 'live'|'cached'|'stale'|'live-error',
 *   meta?: {guardNote?: string, interpretation?: {title: string, causes: string[], actions: string[]} | null, webUrl?: string, instanceLabel?: string, source?: string}
 * }} args
 */
export function showResult({ endpoint, providerName, data, state, meta = {} }) {
  toggle('empty-state', false);
  toggle('resolver-error', false);
  toggle('result-area', true);
  toggle('pending-note', false);

  renderStatusBar({ endpoint, providerName, data, state, meta });
  renderInterpretation({ data, meta, endpoint });
  renderTabsArea({ endpoint, data, meta });

  const stateWord = state === 'live' ? 'live response' : state === 'cached' ? 'cached response (provider not contacted this time)' : 'stale cached response';
  announce(`Done. HTTP ${data.status} ${data.statusText || ''} — ${stateWord}.`, { assertive: data.status >= 400 });
}

function renderStatusBar({ endpoint, providerName, data, state, meta }) {
  const bar = document.getElementById('status-bar');
  clear(bar);

  const statusOk = data.status < 400;
  bar.append(
    stateChip(state),
    el('span', { className: 'chip chip-method mono' }, endpoint.method || 'GET'),
    el('code', { className: 'endpoint mono', title: endpoint.url, tabindex: '0' }, endpoint.url),
    el('span', { className: 'chip chip-provider' }, providerName + (meta.instanceLabel ? ` · ${meta.instanceLabel}` : '')),
    el('span', { className: `chip chip-status ${statusOk ? 'ok' : 'err'} mono` }, `${data.status}${data.statusText ? ` ${data.statusText}` : ''}`),
  );

  const bits = [];
  if (state === 'live') {
    if (typeof data.durationMs === 'number') bits.push(formatDuration(data.durationMs));
  } else {
    bits.push(`fetched ${formatAge(data.fetchedAt)}`);
  }
  bits.push(formatBytes(data.sizeBytes));
  bar.append(el('span', { className: 'status-meta mono' }, bits.join(' · ')));

  const actions = el('span', { className: 'status-actions' },
    iconButton('Refresh', 'Force a live request (bypasses the Request Guard)', () => document.dispatchEvent(new CustomEvent('gitapitaker:refresh'))),
    iconButton('Diff', 'Compare this response with an older snapshot of the same endpoint', () => document.dispatchEvent(new CustomEvent('gitapitaker:diff'))),
    iconButton('Share', 'Copy a shareable inspection link (contains only the target URL, never the response)', async (btn) => {
      const target = meta.webUrl ?? endpoint.url;
      const ok = await copyText(buildShareUrl(target));
      flash(btn, ok);
      announce(ok ? 'Share link copied. It contains only the target URL, never the response.' : 'Copy failed.', {});
    }),
  );
  bar.append(actions);

  const guardNote = document.getElementById('guard-note');
  clear(guardNote);
  if (meta.guardNote) {
    guardNote.append(el('span', {}, meta.guardNote), ' ',
      el('button', { type: 'button', className: 'btn btn-link', onClick: () => document.dispatchEvent(new CustomEvent('gitapitaker:refresh')) }, 'Force live request'));
    guardNote.hidden = false;
  } else {
    guardNote.hidden = true;
  }
}

function renderInterpretation({ data, meta, endpoint }) {
  const interp = meta.interpretation !== undefined
    ? meta.interpretation
    : (data.status >= 400 ? interpretHttpStatus(data.status, endpoint.providerId, data.headers, endpoint.parsed) : null);
  const banner = document.getElementById('interp-banner');
  clear(banner);
  if (!interp) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.className = `interp-banner ${data.status >= 400 ? 'interp-warn' : 'interp-info'}`;
  banner.setAttribute('role', 'note');
  banner.append(
    el('p', { className: 'interp-title' }, interp.title, ' ',
      el('span', { className: 'interp-tag' }, 'GitAPITaker interpretation — not provider documentation')),
    el('ul', {}, interp.causes.map((c) => el('li', {}, c))),
    interp.actions?.length
      ? el('div', { className: 'interp-actions' }, el('strong', {}, 'What you can do: '), el('ul', {}, interp.actions.map((a) => el('li', {}, a))))
      : null,
    el('p', { className: 'view-note' }, 'The provider’s original response body is preserved unchanged in the RAW and JSON views below.'),
  );
}

function hideInterpretation() {
  const banner = document.getElementById('interp-banner');
  clear(banner);
  banner.hidden = true;
}

function renderTabsArea({ endpoint, data, meta }) {
  const mount = document.getElementById('response-tabs');
  clear(mount);
  const parsed = tryParseJson(data.bodyText);

  tabsInstance = createTabs([
    {
      id: 'json', label: 'JSON',
      render: (panel) => {
        if (!parsed.isJson) {
          panel.append(el('p', { className: 'empty-note' },
            'This body is not valid JSON', data.contentType ? ` (Content-Type: ${data.contentType}).` : '.',
            ' The RAW tab shows exactly what the provider returned.'));
          return;
        }
        panel.append(renderJsonTree(parsed.value));
      },
    },
    {
      id: 'raw', label: 'RAW',
      render: (panel) => panel.append(renderRawView(data.bodyText, { sizeBytes: data.sizeBytes, contentType: data.contentType })),
    },
    {
      id: 'headers', label: 'HEADERS',
      render: (panel) => panel.append(renderHeadersView(data.headers)),
    },
    {
      id: 'request', label: 'REQUEST',
      render: (panel) => panel.append(renderRequestView(endpoint, { instanceLabel: meta.instanceLabel, source: meta.source })),
    },
  ], { ariaLabel: 'Response views' });
  mount.append(tabsInstance.root);
}

/** @param {'live'|'cached'|'stale'|'pending'} state */
function stateChip(state) {
  const labels = {
    live: ['LIVE', 'Browser contacted the provider for this inspection'],
    cached: ['CACHED', 'Served from local cache — the provider was NOT contacted this time'],
    stale: ['STALE', 'Older cached copy — the provider was not contacted (or could not be reached)'],
    pending: ['REQUESTING', 'Contacting the provider…'],
  };
  const [label, title] = labels[state] ?? labels.live;
  return el('span', { className: `chip chip-state state-${state}`, title },
    el('span', { className: 'state-dot', 'aria-hidden': 'true' }), label);
}

function iconButton(text, ariaLabel, onClick) {
  const btn = el('button', { type: 'button', className: 'btn btn-ghost btn-sm', title: ariaLabel, 'aria-label': ariaLabel }, text);
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

function flash(btn, ok) {
  const original = btn.textContent;
  btn.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { btn.textContent = original; }, 1500);
}

/**
 * Show a resolver error (malformed URL, unsupported provider/resource).
 * @param {import('../core/errors.js').ResolverError} err
 */
export function showResolverError(err) {
  toggle('result-area', false);
  toggle('pending-note', false);
  toggle('empty-state', false);
  const box = document.getElementById('resolver-error');
  clear(box);
  box.hidden = false;
  box.append(
    el('h2', {}, 'GitAPITaker could not resolve this input'),
    el('p', { className: 'mono error-code' }, err.code),
    el('p', {}, err.message),
    err.hints?.length ? el('ul', { className: 'hint-list' }, err.hints.map((h) => el('li', {}, h))) : null,
    el('p', { className: 'view-note' }, 'No request was sent. Nothing was contacted.'),
  );
  announce(`Resolution failed: ${err.message}`, { assertive: true });
}

/** Show the first-visit empty state. */
export function showEmptyState() {
  toggle('result-area', false);
  toggle('resolver-error', false);
  toggle('pending-note', false);
  toggle('empty-state', true);
}

/** Mount (or hide) the endpoint explorer for the current resolution. */
export function mountExplorer(detection, parsed, hooks) {
  const area = document.getElementById('explorer-area');
  clear(area);
  if (!detection || !parsed) { area.hidden = true; return; }
  const related = detection.provider.related ? detection.provider.related(parsed, detection.ctx) : [];
  if (!related.length) {
    area.hidden = true;
    return;
  }
  area.hidden = false;
  clear(area);
  area.append(el('h2', { className: 'section-title' }, 'Endpoint Explorer'),
    el('p', { className: 'view-note' }, `Related resources for ${detection.provider.describe(parsed)} — driven by the ${detection.provider.name} adapter’s capability metadata.`));
  area.append(renderExplorer(related, hooks));
}

function toggle(id, visible) {
  const node = document.getElementById(id);
  if (node) node.hidden = !visible;
}

/** Keyboard shortcut support: switch JSON/RAW/HEADERS/REQUEST. */
export function selectResponseTab(id) {
  tabsInstance?.select(id);
}

export function hasResult() {
  return !document.getElementById('result-area').hidden;
}

