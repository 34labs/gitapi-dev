/**
 * Inspector presentation layer — the "instrument panel".
 *
 * Signature elements:
 *   - Resolution pipeline: DETECT → PARSE → RESOLVE → FETCH, rendered with
 *     the actual values from each stage (or the stage that failed).
 *   - Metadata rail: state badge, status, timing, size, guard status and
 *     actions — always labeled LIVE / CACHED / STALE, never color alone.
 *
 * All inspection logic lives in core modules; this file only renders state.
 */

import { el, clear, copyText } from './dom.js';
import { createTabs } from './tabs.js';
import { announce } from './announce.js';
import { renderJsonTree } from '../viewer/json.js';
import { renderRawView } from '../viewer/raw.js';
import { renderHeadersView } from '../viewer/headers.js';
import { renderRequestView } from '../viewer/request.js';
import { tryParseJson } from '../core/request.js';
import { formatBytes, formatDuration, formatAge, formatTimestamp, truncateMiddle } from '../core/format.js';
import { interpretHttpStatus } from '../core/errors.js';
import { renderExplorer } from './explorer.js';
import { buildShareUrl } from '../core/share.js';
import { buildCurlCommand } from '../core/curl.js';
import { describePagination } from '../core/pagination.js';
import { showSnackbar } from './snackbar.js';

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

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * Render the stage-by-stage pipeline.
 * @param {Array<{label: string, value: string, state?: 'ok'|'active'|'fail'|'pending'|'skip'}>} stages
 */
export function renderPipeline(stages) {
  const bar = document.getElementById('pipeline');
  clear(bar);
  if (!stages || stages.length === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  stages.forEach((stage, i) => {
    if (i > 0) bar.append(el('span', { className: 'pipeline-sep', 'aria-hidden': 'true' }, '─'));
    bar.append(el('div', { className: `pipeline-stage ps-${stage.state ?? 'ok'}` },
      el('span', { className: 'stage-label' }, stage.label),
      el('span', { className: 'stage-value mono', title: stage.value }, stage.value),
    ));
  });
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

/** Hide result sections, show a waiting state. @param {object} endpoint @param {Array} stages */
export function showPending(endpoint, stages = []) {
  toggle('empty-state', false);
  toggle('resolver-error', false);
  toggle('result-area', true);
  toggle('pending-note', true);
  hideInterpretation();
  hideChangeNote();
  hidePagination();
  toggle('explorer-area', false);
  clear(document.getElementById('response-tabs'));

  renderPipeline([...stages, { label: 'fetch', value: 'direct request in flight…', state: 'active' }]);

  const rail = document.getElementById('status-bar');
  clear(rail);
  rail.append(
    el('div', { className: 'rail-head' }, stateChip('pending')),
    el('p', { className: 'rail-endpoint mono' }, `${endpoint.method || 'GET'} ${endpoint.url}`),
    el('p', { className: 'view-note' }, 'Contacting the provider directly from this browser…'),
  );
  announce(`Requesting ${endpoint.url} directly from the provider.`);
}

/**
 * Render a finished inspection.
 * @param {{
 *   endpoint: import('../core/types.js').ResolvedEndpoint,
 *   providerName: string,
 *   data: {status: number, statusText: string, headers: Array<[string,string]>, bodyText: string, sizeBytes: number, contentType?: string, durationMs?: number, fetchedAt: number},
 *   state: 'live'|'cached'|'stale',
 *   stages?: Array<{label: string, value: string}>,
 *   meta?: {guardNote?: string|null, interpretation?: object|null, webUrl?: string, instanceLabel?: string, source?: string, changeNote?: object|null, pagination?: object|null, onPaginate?: (url: string) => void}
 * }} args
 */
export function showResult({ endpoint, providerName, data, state, stages = [], meta = {} }) {
  toggle('empty-state', false);
  toggle('resolver-error', false);
  toggle('result-area', true);
  toggle('pending-note', false);

  renderPipeline([...stages, fetchStage(state, data, meta)]);
  renderMetaRail({ endpoint, providerName, data, state, meta });
  renderInterpretation({ data, meta, endpoint });
  renderChangeNote(meta.changeNote ?? null);
  renderPagination(meta.pagination ?? null, meta.onPaginate);
  renderTabsArea({ endpoint, data, meta });

  const stateWord = state === 'live'
    ? 'live response'
    : state === 'cached'
      ? 'cached response (provider not contacted this time)'
      : 'stale cached response';
  announce(`Done. HTTP ${data.status} ${data.statusText || ''} — ${stateWord}.`, { assertive: data.status >= 400 });
}

function fetchStage(state, data, meta) {
  const size = formatBytes(data.sizeBytes);
  if (state === 'live') {
    return { label: 'fetch', value: `LIVE ${data.status} · ${formatDuration(data.durationMs)} · ${size}`, state: 'ok' };
  }
  const age = `stored ${formatAge(data.fetchedAt)}`;
  if (meta.reason === 'offline') return { label: 'fetch', value: `STALE · provider unreachable · ${age}`, state: 'fail' };
  return { label: 'fetch', value: `${state.toUpperCase()} · ${age} · ${size}`, state: state === 'cached' ? 'ok' : 'pending' };
}

/* ------------------------------------------------------------------ */
/* Metadata rail                                                       */
/* ------------------------------------------------------------------ */

function renderMetaRail({ endpoint, providerName, data, state, meta }) {
  const rail = document.getElementById('status-bar');
  clear(rail);

  const statusOk = data.status < 400 && data.status > 0;
  rail.append(el('div', { className: 'rail-head' },
    stateChip(state),
    el('span', { className: `rail-status mono ${statusOk ? 'ok' : 'err'}` }, `${data.status}${data.statusText ? ` ${data.statusText}` : ''}`),
  ));

  const kv = el('dl', { className: 'rail-kv' });
  const row = (label, value, title) => {
    kv.append(el('dt', {}, label), el('dd', { className: 'mono', title: title ?? undefined }, value));
  };
  row('endpoint', truncateMiddle(endpoint.url, 46), endpoint.url);
  row('provider', providerName + (meta.instanceLabel ? ` · ${meta.instanceLabel}` : ''));
  if (state === 'live' && typeof data.durationMs === 'number') row('duration', formatDuration(data.durationMs));
  if (state !== 'live') row('age', formatAge(data.fetchedAt));
  row('size', formatBytes(data.sizeBytes));
  row('fetched', formatTimestamp(data.fetchedAt));
  if (meta.source) row('source', meta.source);
  rail.append(kv);

  const guardNote = el('div', { id: 'guard-note', className: 'guard-note', role: 'note', hidden: '' });
  if (meta.guardNote) {
    guardNote.hidden = false;
    guardNote.append(el('p', {}, meta.guardNote),
      el('button', { type: 'button', className: 'btn btn-link', onClick: () => document.dispatchEvent(new CustomEvent('gitapitaker:refresh')) }, 'Force live request'));
  }
  rail.append(guardNote);

  rail.append(el('div', { className: 'rail-actions' },
    railButton('Refresh', 'Force a live request (bypasses the Request Guard)', () => document.dispatchEvent(new CustomEvent('gitapitaker:refresh'))),
    railButton('Diff', 'Compare with an older snapshot of this endpoint', () => document.dispatchEvent(new CustomEvent('gitapitaker:diff'))),
    railButton('Share', 'Copy a shareable inspection link (target URL only, never the response)', async () => {
      const target = meta.webUrl ?? endpoint.url;
      const ok = await copyText(buildShareUrl(target));
      showSnackbar(ok ? 'Share link copied — target URL only' : 'Copy failed');
      announce(ok ? 'Share link copied. It contains only the target URL, never the response.' : 'Copy failed.');
    }),
    railButton('cURL', 'Copy this request as a cURL command', async () => {
      const ok = await copyText(buildCurlCommand(endpoint));
      showSnackbar(ok ? 'cURL copied — no credentials included' : 'Copy failed');
      announce(ok ? 'cURL command copied. It contains no credentials.' : 'Copy failed.');
    }),
  ));
}

function railButton(text, label, onClick) {
  const btn = el('button', { type: 'button', className: 'm3-btn tonal btn-sm', title: label, 'aria-label': label }, text);
  btn.addEventListener('click', () => onClick());
  return btn;
}

/* ------------------------------------------------------------------ */
/* Interpretation / change note / pagination                           */
/* ------------------------------------------------------------------ */

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
    interp.quickActions?.length ? el('div', { className: 'interp-quick' }, quickActionButtons(interp.quickActions)) : null,
    el('p', { className: 'view-note' }, 'The provider’s original response body is preserved unchanged in the RAW and JSON views below.'),
  );
}

function quickActionButtons(actions) {
  return actions.map((a) => {
    const btn = el('button', { type: 'button', className: 'm3-btn outlined btn-sm' }, a.label);
    btn.addEventListener('click', () => {
      if (a.input) document.dispatchEvent(new CustomEvent('gitapitaker:inspect', { detail: { input: a.input } }));
      if (a.goto) document.dispatchEvent(new CustomEvent('gitapitaker:goto', { detail: { page: a.goto } }));
    });
    return btn;
  });
}

function renderChangeNote(changeNote) {
  const node = document.getElementById('change-note');
  clear(node);
  if (!changeNote) { node.hidden = true; return; }
  node.hidden = false;
  const text = changeNote.findings >= 0
    ? `This response changed since the previous capture — ${changeNote.findings} structural difference${changeNote.findings === 1 ? '' : 's'} detected.`
    : 'This response body changed since the previous capture (non-JSON bodies cannot be diffed structurally — compare RAW).';
  const diffBtn = el('button', { type: 'button', className: 'm3-btn text btn-sm' }, 'View diff');
  diffBtn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('gitapitaker:diff')));
  node.append(el('span', {}, text), ' ', diffBtn);
}

function hideChangeNote() {
  const node = document.getElementById('change-note');
  clear(node);
  node.hidden = true;
}

function renderPagination(pagination, onPaginate) {
  const bar = document.getElementById('pagination-bar');
  clear(bar);
  if (!pagination || (!pagination.nextUrl && !pagination.prevUrl)) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.append(
    el('span', { className: 'pagination-label' }, 'Pagination'),
    el('span', { className: 'mono pagination-info' }, describePagination(pagination)),
  );
  const prev = el('button', { type: 'button', className: 'm3-btn tonal btn-sm', disabled: !pagination.prevUrl }, '← Prev');
  const next = el('button', { type: 'button', className: 'm3-btn tonal btn-sm', disabled: !pagination.nextUrl }, 'Next →');
  if (pagination.prevUrl) prev.addEventListener('click', () => onPaginate?.(pagination.prevUrl));
  if (pagination.nextUrl) next.addEventListener('click', () => onPaginate?.(pagination.nextUrl));
  bar.append(el('span', { className: 'pagination-buttons' }, prev, next));
}

function hidePagination() {
  const bar = document.getElementById('pagination-bar');
  clear(bar);
  bar.hidden = true;
}

function hideInterpretation() {
  const banner = document.getElementById('interp-banner');
  clear(banner);
  banner.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function renderTabsArea({ endpoint, data, meta }) {
  const mount = document.getElementById('response-tabs');
  clear(mount);
  const parsed = tryParseJson(data.bodyText);

  tabsInstance = createTabs([
    {
      id: 'json', label: 'JSON', kbd: '1',
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
      id: 'raw', label: 'RAW', kbd: '2',
      render: (panel) => panel.append(renderRawView(data.bodyText, { sizeBytes: data.sizeBytes, contentType: data.contentType })),
    },
    {
      id: 'headers', label: 'HEADERS', kbd: '3',
      render: (panel) => panel.append(renderHeadersView(data.headers)),
    },
    {
      id: 'request', label: 'REQUEST', kbd: '4',
      render: (panel) => panel.append(renderRequestView(endpoint, { instanceLabel: meta.instanceLabel, source: meta.source })),
    },
  ], { ariaLabel: 'Response views' });
  mount.append(tabsInstance.root);
}

/* ------------------------------------------------------------------ */
/* Errors & empty state                                                */
/* ------------------------------------------------------------------ */

const STAGE_ORDER = ['input', 'detect', 'parse', 'resolve', 'fetch'];

/**
 * Show a resolver error with an honest stage-by-stage pipeline view.
 * @param {import('../core/errors.js').ResolverError} err
 */
export function showResolverError(err) {
  toggle('result-area', false);
  toggle('pending-note', false);
  toggle('empty-state', false);
  hideInterpretation();
  hideChangeNote();
  hidePagination();
  toggle('explorer-area', false);

  const failedAt = err.stage ?? 'input';
  const ctx = err.context ?? {};
  const failedIndex = STAGE_ORDER.indexOf(failedAt);
  const values = {
    input: ctx.input ?? '—',
    detect: ctx.host ? `${ctx.host} → ${ctx.providerId ?? 'no adapter matched'}` : (ctx.input ?? '—'),
    parse: ctx.providerId ? `${ctx.providerId} resource parse` : '—',
    resolve: ctx.parsed ? `${ctx.parsed.resourceType}` : '—',
    fetch: 'not attempted',
  };
  const stages = STAGE_ORDER.map((label, i) => ({
    label,
    value: i === failedIndex ? (label === failedAt ? shortFailureValue(label, err, values) : values[label]) : (i < failedIndex ? values[label] : '—'),
    state: i === failedIndex ? 'fail' : (i < failedIndex ? 'ok' : 'skip'),
  }));
  renderPipeline(stages);

  const box = document.getElementById('resolver-error');
  clear(box);
  box.hidden = false;
  box.append(
    el('h2', {}, 'GitAPITaker could not resolve this input'),
    el('p', { className: 'mono error-code' }, `${err.code} · stage: ${failedAt}`),
    el('p', {}, err.message),
    err.hints?.length ? el('ul', { className: 'hint-list' }, err.hints.map((h) => el('li', {}, h))) : null,
    err.quickActions?.length ? el('div', { className: 'interp-quick' }, quickActionButtons(err.quickActions)) : null,
    el('p', { className: 'view-note' }, 'No request was sent. Nothing was contacted.'),
  );
  announce(`Resolution failed at ${failedAt}: ${err.message}`, { assertive: true });
}

function shortFailureValue(stage, err, values) {
  if (stage === 'detect') return `${err.context?.host ?? '?'} → no adapter`;
  return values[stage] ?? 'failed';
}

/**
 * The request never produced a response and no cached fallback exists.
 * @param {{endpoint: object, providerName: string, failure: {title: string, causes: string[], actions: string[]}, stages?: Array}} args
 */
export function showNetworkError({ endpoint, providerName, failure, stages = [] }) {
  toggle('result-area', false);
  toggle('pending-note', false);
  toggle('empty-state', false);
  hideInterpretation();
  hideChangeNote();
  hidePagination();
  toggle('explorer-area', false);

  renderPipeline([...stages, { label: 'fetch', value: 'no response — network/CORS failure', state: 'fail' }]);

  const box = document.getElementById('resolver-error');
  clear(box);
  box.hidden = false;
  box.append(
    el('h2', {}, 'The provider could not be reached'),
    el('p', { className: 'mono error-code' }, `network-error · ${providerName}`),
    el('p', {}, failure.title),
    el('ul', { className: 'hint-list' }, failure.causes.map((c) => el('li', {}, c))),
    el('p', {}, el('strong', {}, 'What you can do: ')),
    el('ul', { className: 'hint-list' }, failure.actions.map((a) => el('li', {}, a))),
    el('p', { className: 'view-note' },
      `Attempted: ${endpoint.method || 'GET'} ${endpoint.url}. No response was received, so no response data is shown.`,
      ' If a cached copy exists, it is available in the Cache inspector.'),
  );
  announce(`Request failed: ${failure.title}`, { assertive: true });
}

/** Show the first-visit empty state. */
export function showEmptyState() {
  toggle('result-area', false);
  toggle('resolver-error', false);
  toggle('pending-note', false);
  toggle('empty-state', true);
  renderPipeline([]);
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
  area.append(el('h2', { className: 'section-title' }, 'Endpoint Explorer'),
    el('p', { className: 'view-note' }, `Related resources for ${detection.provider.describe(parsed)} — driven by the ${detection.provider.name} adapter’s capability metadata.`));
  area.append(renderExplorer(related, hooks));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function stateChip(state) {
  const labels = {
    live: ['LIVE', 'Browser contacted the provider for this inspection'],
    cached: ['CACHED', 'Served from local cache — the provider was NOT contacted this time'],
    stale: ['STALE', 'Older cached copy — the provider was not contacted (or could not be reached)'],
    pending: ['REQUESTING', 'Contacting the provider…'],
  };
  const [label, title] = labels[state] ?? labels.live;
  return el('span', { className: `m3-chip chip-${state}`, title },
    el('span', { className: 'state-dot', 'aria-hidden': 'true' }), label);
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
