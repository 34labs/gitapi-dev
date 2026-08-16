/**
 * GitAPITaker application shell.
 *
 * Wires the provider-agnostic core (resolver, request, cache, guard,
 * history) to the presentation layer. All domain logic lives in src/core
 * and src/providers; this file only orchestrates.
 *
 * Product philosophy: direct, transparent, private, keyboard-first,
 * extensible, honest about the network.
 */

import { resolveInput, endpointFromExplorerItem } from './core/resolver.js';
import { executeEndpoint, tryParseJson } from './core/request.js';
import { ResolverError, interpretHttpStatus, interpretFetchFailure } from './core/errors.js';
import { cacheKey, readEntry, storeLiveResponse, entryState, listSnapshots, clearAll as clearCacheAll } from './core/cache.js';
import { createGuard } from './core/guard.js';
import { addHistory, clearHistory } from './core/history.js';
import { buildCurlCommand } from './core/curl.js';
import { buildShareUrl } from './core/share.js';
import { diffJson } from './core/diff.js';
import { getProvider } from './providers/registry.js';
import { formatAge, formatTimestamp } from './core/format.js';

import { el, clear, copyText } from './ui/dom.js';
import { announce } from './ui/announce.js';
import { createRouter, navigate } from './ui/router.js';
import { createPalette } from './ui/palette.js';
import { createHelp } from './ui/help.js';
import { rovingList } from './ui/keyboard.js';
import {
  initInspector, focusInput, getInputValue, setInputValue,
  showPending, showResult, showResolverError, showEmptyState, showNetworkError,
  mountExplorer, selectResponseTab, hasResult,
} from './ui/inspector.js';
import { initHistory, renderHistoryView } from './ui/history-view.js';
import { renderCacheView, initCacheView } from './ui/cache-view.js';
import { renderProvidersView } from './ui/providers-view.js';
import { renderCommunityView } from './ui/community.js';

const guard = createGuard();

/** Current inspection context (or null). */
let current = null;

/* ------------------------------------------------------------------ */
/* Inspection flow                                                     */
/* ------------------------------------------------------------------ */

/**
 * Inspect user input (web URL or shorthand).
 * @param {string} rawInput
 * @param {{force?: boolean}} [opts]
 */
async function inspectInput(rawInput, opts = {}) {
  let resolution;
  try {
    resolution = resolveInput(rawInput);
  } catch (err) {
    if (err instanceof ResolverError) {
      current = null;
      showResolverError(err);
      return;
    }
    throw err;
  }
  const { provider, detection, parsed, endpoint, url } = resolution;
  setInputValue(url.toString());
  await inspectEndpoint(endpoint, {
    detection, parsed, force: opts.force,
    webUrl: url.toString(), source: 'url',
    providerName: provider.name,
    instanceLabel: detection.ctx.instanceLabel,
  });
}

/**
 * Inspect a concrete endpoint (from resolution, the explorer, history or
 * the cache inspector). Applies the Request Guard and caching rules.
 */
async function inspectEndpoint(endpoint, opts = {}) {
  const {
    detection = null, parsed = null, force = false,
    webUrl = null, source = 'explorer',
    providerName = getProvider(endpoint.providerId)?.name ?? endpoint.providerId,
    instanceLabel = undefined,
  } = opts;

  const key = cacheKey(endpoint.providerId, endpoint.method, endpoint.url);
  current = { endpoint, detection, parsed, webUrl, cacheKey: key, providerName, instanceLabel };

  const decision = guard.decide(key, { force });
  if (decision.action === 'cache') {
    const entry = readEntry(key);
    if (entry) {
      guard.recordSuppressed(key);
      showCached(entry, {
        state: entryState(entry) === 'fresh' ? 'cached' : 'stale',
        guardNote: buildGuardNote(key),
        reason: 'suppressed',
      });
      addHistory({
        providerId: endpoint.providerId, resourceType: parsed?.resourceType ?? endpoint.resourceType,
        webUrl, endpoint: endpoint.url, method: endpoint.method,
        status: entry.status, stateLabel: entryState(entry) === 'fresh' ? 'CACHED' : 'STALE',
      });
      return;
    }
    // Guard wanted cache but none exists — a live request is the only honest option.
  }

  showPending(endpoint);
  const result = await executeEndpoint(endpoint);

  if (result.ok) {
    const record = result.record;
    const { stored } = storeLiveResponse(key, record, { webUrl, resourceType: parsed?.resourceType ?? endpoint.resourceType });
    guard.recordLive(key);
    addHistory({
      providerId: endpoint.providerId, resourceType: parsed?.resourceType ?? endpoint.resourceType,
      webUrl, endpoint: endpoint.url, method: endpoint.method,
      status: record.status, stateLabel: 'LIVE',
    });
    const interpretation = record.status >= 400
      ? interpretHttpStatus(record.status, endpoint.providerId, record.headers, parsed)
      : null;
    showResult({
      endpoint, providerName, data: record, state: 'live',
      meta: { interpretation, webUrl, instanceLabel, source, stored: stored ? undefined : 'storage-unavailable' },
    });
    if (!stored) {
      announce('Warning: browser storage is unavailable; this response cannot be cached locally.', { assertive: true });
    }
    mountExplorer(detection, parsed, {
      onSelect: (item) => inspectEndpoint(endpointFromExplorerItem(item, detection), {
        detection, source: 'explorer', providerName, instanceLabel,
      }),
    });
  } else {
    const failure = interpretFetchFailure(result.error);
    const entry = readEntry(key);
    addHistory({
      providerId: endpoint.providerId, resourceType: parsed?.resourceType ?? endpoint.resourceType,
      webUrl, endpoint: endpoint.url, method: endpoint.method, stateLabel: 'NETWORK-ERROR',
    });
    if (entry) {
      showCached(entry, {
        state: 'stale',
        guardNote: null,
        reason: 'offline',
        errorInterp: failure,
      });
    } else {
      showNetworkError({ endpoint, providerName, failure });
      current = null;
    }
  }
}

function buildGuardNote(key) {
  const info = guard.describe(key);
  const nextIn = info.lastLiveAt
    ? Math.max(0, Math.ceil((info.lastLiveAt + info.cooldownMs - Date.now()) / 1000))
    : 0;
  return `Request Guard: repeat request suppressed and served from local cache. `
    + `${info.suppressed} repeat${info.suppressed === 1 ? '' : 's'} suppressed this session. `
    + (nextIn > 0 ? `A live request is allowed again in ~${nextIn} s.` : 'A live request is allowed now.');
}

/** Render a cache entry as CACHED/STALE — never as live. */
function showCached(entry, { state, guardNote, reason, errorInterp = null }) {
  const providerName = getProvider(entry.providerId)?.name ?? entry.providerId;
  const endpoint = {
    providerId: entry.providerId,
    method: entry.method,
    url: entry.endpoint,
    headers: entry.requestHeaders ?? {},
    resourceType: entry.resourceType,
    apiBase: undefined,
  };
  current = { endpoint, detection: null, parsed: null, webUrl: entry.webUrl ?? null, cacheKey: entry.key, providerName };

  const meta = {
    guardNote: guardNote ?? null,
    interpretation: errorInterp ?? (entry.status >= 400 ? interpretHttpStatus(entry.status, entry.providerId, entry.headers) : null),
    webUrl: entry.webUrl,
    source: reason === 'offline'
      ? 'Offline fallback (provider unreachable; local cache shown)'
      : reason === 'suppressed'
        ? 'Served by Request Guard from local cache'
        : 'Loaded from local cache',
  };
  showResult({
    endpoint, providerName,
    data: {
      status: entry.status, statusText: entry.statusText, headers: entry.headers,
      bodyText: entry.bodyText, sizeBytes: entry.sizeBytes, fetchedAt: entry.fetchedAt,
    },
    state,
    meta,
  });
  mountExplorer(current.detection, current.parsed, { onSelect: () => {} });
  announce(reason === 'offline'
    ? 'Provider unreachable. Showing a stale cached copy; all four views remain available.'
    : `Request suppressed by the Request Guard. Showing ${state} cached response from ${formatAge(entry.fetchedAt)}.`);
}



function refreshCurrent() {
  if (!current) {
    const value = getInputValue();
    if (value.trim()) inspectInput(value, { force: true });
    else focusInput();
    return;
  }
  inspectEndpoint(current.endpoint, {
    detection: current.detection, parsed: current.parsed, force: true,
    webUrl: current.webUrl, source: 'url',
    providerName: current.providerName, instanceLabel: current.instanceLabel,
  });
}

/* ------------------------------------------------------------------ */
/* Response Diff                                                       */
/* ------------------------------------------------------------------ */

function openDiff() {
  const dialog = document.getElementById('diff-dialog');
  const body = dialog.querySelector('#diff-body');
  clear(body);

  if (!current) {
    body.append(el('p', { className: 'empty-note' }, 'Inspect something first — diff compares two responses of one endpoint.'));
    dialog.showModal();
    return;
  }
  const entry = readEntry(current.cacheKey);
  const snapshots = listSnapshots(current.cacheKey);
  if (!entry || snapshots.length === 0) {
    body.append(el('p', { className: 'empty-note' },
      'No older snapshot exists for this endpoint yet. ',
      'Every time a live response replaces an existing cache entry, the previous one is archived here for comparison.'));
    dialog.showModal();
    return;
  }

  const newer = { label: `Newer — fetched ${formatTimestamp(entry.fetchedAt)} (${formatAge(entry.fetchedAt)})`, entry };
  const choices = [...snapshots].reverse(); // newest snapshot first
  let older = choices[0];

  const chooser = el('div', { className: 'diff-chooser', role: 'radiogroup', 'aria-label': 'Choose the older response to compare' });
  const list = el('div', { className: 'diff-snapshots' });
  choices.forEach((snap, i) => {
    const btn = el('button', {
      type: 'button', role: 'radio', className: 'btn btn-ghost btn-sm',
      'aria-checked': String(i === 0), tabindex: i === 0 ? '0' : '-1',
      'aria-label': `Older response fetched ${formatTimestamp(snap.fetchedAt)}, HTTP ${snap.status}`,
    }, `Older · ${formatTimestamp(snap.fetchedAt)} · HTTP ${snap.status}`);
    btn.addEventListener('click', () => {
      older = snap;
      list.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-checked', String(b === btn)); b.tabIndex = b === btn ? 0 : -1; });
      render();
    });
    list.append(btn);
  });
  chooser.append(el('p', {}, 'Compare against:'), list);

  const result = el('div', { className: 'diff-result' });
  body.append(chooser, result);

  function render() {
    clear(result);
    const olderParsed = tryParseJson(older.bodyText);
    const newerParsed = tryParseJson(newer.entry.bodyText);
    result.append(el('p', { className: 'view-note' },
      `Older response: fetched ${formatTimestamp(older.fetchedAt)} (HTTP ${older.status}). `,
      `Newer response: fetched ${formatTimestamp(newer.entry.fetchedAt)} (HTTP ${newer.entry.status}). `,
      'Original responses are never modified.'));
    if (!olderParsed.isJson || !newerParsed.isJson) {
      result.append(el('p', { className: 'empty-note' },
        'Structural diff needs JSON on both sides. Use the RAW view to compare non-JSON bodies visually.'));
      return;
    }
    const findings = diffJson(olderParsed.value, newerParsed.value);
    if (findings.length === 0) {
      result.append(el('p', { className: 'empty-note' }, 'No differences found — the two JSON bodies are identical.'));
      return;
    }
    const added = findings.filter((f) => f.type === 'added').length;
    const removed = findings.filter((f) => f.type === 'removed').length;
    const changed = findings.filter((f) => f.type === 'changed').length;
    result.append(el('p', { className: 'mono' }, `${findings.length} finding(s): ${added} added · ${removed} removed · ${changed} changed (arrays compared by index).`));
    const table = el('table', { className: 'kv-table diff-table' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, 'Path'), el('th', { scope: 'col' }, 'Change'),
        el('th', { scope: 'col' }, 'Older'), el('th', { scope: 'col' }, 'Newer'))),
    );
    const tbody = el('tbody');
    for (const f of findings.slice(0, 200)) {
      tbody.append(el('tr', {},
        el('td', { className: 'mono' }, f.path),
        el('td', {}, el('span', { className: `chip chip-muted diff-${f.type}` }, f.type)),
        el('td', { className: 'mono' }, f.type === 'added' ? '—' : String(JSON.stringify(f.before))),
        el('td', { className: 'mono' }, f.type === 'removed' ? '—' : String(JSON.stringify(f.after))),
      ));
    }
    table.append(tbody);
    result.append(table);
    if (findings.length > 200) result.append(el('p', { className: 'view-note' }, `Showing first 200 of ${findings.length} findings.`));
  }

  render();
  dialog.showModal();
  rovingList(dialog, '.diff-snapshots button', { onActivate: (node) => node.click() });
}

/* ------------------------------------------------------------------ */
/* Pages, palette, shortcuts                                           */
/* ------------------------------------------------------------------ */

const PAGE_SECTIONS = {
  inspector: 'page-inspector',
  history: 'page-history',
  cache: 'page-cache',
  providers: 'page-providers',
  community: 'page-community',
  about: 'page-about',
};

let currentPage = 'inspector';

function showPage(page, inspectTarget = null) {
  currentPage = page;
  for (const [name, id] of Object.entries(PAGE_SECTIONS)) {
    document.getElementById(id).hidden = name !== page;
  }
  document.querySelectorAll('.site-nav a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const linkPage = href === '#/' ? 'inspector' : href.replace('#/', '');
    if (linkPage === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  if (page === 'history') renderHistoryView();
  if (page === 'cache') renderCacheView(cacheHooks);
  if (page === 'providers') renderProvidersView();
  if (page === 'community') renderCommunityView();
  if (page === 'about') { /* static content */ }

  const heading = document.querySelector(`#${PAGE_SECTIONS[page]} h1`);
  if (page !== 'inspector' || !inspectTarget) heading?.focus({ preventScroll: false });

  if (page === 'inspector' && inspectTarget) {
    setInputValue(inspectTarget);
    inspectInput(inspectTarget);
  } else if (page === 'inspector' && !current && document.getElementById('resolver-error').hidden) {
    showEmptyState();
  }
}

const cacheHooks = {
  onInspectEntry: (entry) => {
    navigate('inspector');
    showCached(entry, { state: entryState(entry) === 'fresh' ? 'cached' : 'stale', guardNote: null, reason: 'manual' });
  },
  onRefreshEntry: (entry) => {
    navigate('inspector');
    inspectEndpoint({
      providerId: entry.providerId, method: entry.method, url: entry.endpoint,
      headers: entry.requestHeaders ?? {}, resourceType: entry.resourceType,
    }, { force: true, webUrl: entry.webUrl, source: 'Cache inspector → refresh' });
  },
};

function getPaletteActions() {
  return [
    { id: 'focus-input', label: 'Focus URL input', hint: '/', keywords: 'input url address', run: () => { showPage('inspector'); navigate('inspector'); focusInput(); } },
    { id: 'inspect', label: 'Inspect current URL', hint: 'Enter', keywords: 'run go resolve', run: () => inspectInput(getInputValue()) },
    { id: 'refresh', label: 'Force live request (bypass Request Guard)', hint: 'r', keywords: 'reload refresh live', run: refreshCurrent },
    { id: 'tab-json', label: 'View: JSON', hint: '1', keywords: 'tree parsed', run: () => selectResponseTab('json') },
    { id: 'tab-raw', label: 'View: RAW', hint: '2', keywords: 'body original', run: () => selectResponseTab('raw') },
    { id: 'tab-headers', label: 'View: HEADERS', hint: '3', keywords: 'response headers', run: () => selectResponseTab('headers') },
    { id: 'tab-request', label: 'View: REQUEST', hint: '4', keywords: 'request curl', run: () => selectResponseTab('request') },
    { id: 'copy-body', label: 'Copy response body', keywords: 'clipboard copy body', run: copyBody },
    { id: 'copy-curl', label: 'Copy as cURL', hint: 'y', keywords: 'curl command copy', run: copyCurl },
    { id: 'copy-share', label: 'Copy share link', hint: 's', keywords: 'share url link copy', run: copyShare },
    { id: 'diff', label: 'Response diff (compare with older snapshot)', hint: 'd', keywords: 'diff compare changes', run: openDiff },
    { id: 'page-history', label: 'Go to: History', keywords: 'history past inspections', run: () => navigate('history') },
    { id: 'page-cache', label: 'Go to: Cache inspector', keywords: 'cache storage entries', run: () => navigate('cache') },
    { id: 'page-providers', label: 'Go to: Providers & instances', keywords: 'providers docs instances self-hosted', run: () => navigate('providers') },
    { id: 'page-community', label: 'Go to: Community', keywords: 'community discussions giscus', run: () => navigate('community') },
    { id: 'page-about', label: 'Go to: About & Security', keywords: 'about security privacy', run: () => navigate('about') },
    { id: 'clear-cache', label: 'Clear local cache', keywords: 'clear delete cache', run: () => { cacheClear(); } },
    { id: 'clear-history', label: 'Clear history', keywords: 'clear delete history', run: () => { historyClear(); } },
    { id: 'help', label: 'Keyboard shortcuts', hint: '?', keywords: 'help shortcuts keys', run: () => help.open() },
  ];
}

async function copyBody() {
  const entry = current ? readEntry(current.cacheKey) : null;
  if (!entry) { announce('Nothing to copy yet — inspect a URL first.'); return; }
  const ok = await copyText(entry.bodyText);
  announce(ok ? 'Response body copied.' : 'Copy failed.');
}

async function copyCurl() {
  if (!current) { announce('Nothing to copy yet — inspect a URL first.'); return; }
  const ok = await copyText(buildCurlCommand(current.endpoint));
  announce(ok ? 'cURL command copied. It contains no credentials.' : 'Copy failed.');
}

async function copyShare() {
  const target = current?.webUrl ?? current?.endpoint?.url ?? getInputValue();
  if (!target) { announce('Nothing to share yet — inspect a URL first.'); return; }
  const ok = await copyText(buildShareUrl(target));
  announce(ok ? 'Share link copied. It contains only the target URL, never the response.' : 'Copy failed.');
}

function cacheClear() {
  clearCacheAll();
  announce('Local cache cleared.');
  if (currentPage === 'cache') renderCacheView(cacheHooks);
}

function historyClear() {
  clearHistory();
  announce('History cleared.');
  if (currentPage === 'history') renderHistoryView();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

let palette;
let help;

function boot() {
  initInspector({ onInspect: (value) => inspectInput(value) });
  initHistory({
    onReopen: (entry) => {
      navigate('inspector');
      if (entry.webUrl) inspectInput(entry.webUrl);
      else {
        const provider = getProvider(entry.providerId);
        inspectEndpoint({
          providerId: entry.providerId,
          method: entry.method ?? 'GET',
          url: entry.endpoint,
          headers: provider?.requestHeaders ?? { Accept: 'application/json' },
        }, {
          force: false, source: 'History', providerName: provider?.name ?? entry.providerId,
        });
      }
    },
  });
  initCacheView();

  palette = createPalette({ getActions: getPaletteActions });
  help = createHelp();

  document.getElementById('palette-open').addEventListener('click', () => palette.open());
  document.getElementById('diff-close').addEventListener('click', () => document.getElementById('diff-dialog').close());
  document.getElementById('diff-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); document.getElementById('diff-dialog').close(); }
  });

  document.addEventListener('gitapitaker:refresh', () => refreshCurrent());
  document.addEventListener('gitapitaker:diff', () => openDiff());
  document.addEventListener('gitapitaker:cache-changed', () => { if (currentPage === 'cache') renderCacheView(cacheHooks); });

  document.addEventListener('keydown', onGlobalKeydown);

  createRouter({
    onChange: ({ page, inspectTarget }) => showPage(page, inspectTarget),
  }).emit();

  if (!location.hash) showEmptyState();
}

function onGlobalKeydown(event) {
  const target = event.target;
  const typing = target instanceof HTMLElement && (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
  );
  const dialogOpen = document.querySelector('dialog[open]');

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (dialogOpen) dialogOpen.close();
    palette.open();
    return;
  }
  if (typing || dialogOpen) return;

  if (event.key === '/') { event.preventDefault(); navigate('inspector'); focusInput(); return; }
  if (event.key === '?') { event.preventDefault(); help.open(); return; }
  if (currentPage !== 'inspector') return;

  switch (event.key) {
    case '1': if (hasResult()) { event.preventDefault(); selectResponseTab('json'); } break;
    case '2': if (hasResult()) { event.preventDefault(); selectResponseTab('raw'); } break;
    case '3': if (hasResult()) { event.preventDefault(); selectResponseTab('headers'); } break;
    case '4': if (hasResult()) { event.preventDefault(); selectResponseTab('request'); } break;
    case 'r': if (current) { event.preventDefault(); refreshCurrent(); } break;
    case 'y': if (current) { event.preventDefault(); copyCurl(); } break;
    case 's': if (current) { event.preventDefault(); copyShare(); } break;
    case 'd': if (current) { event.preventDefault(); openDiff(); } break;
    default: break;
  }
}

boot();
