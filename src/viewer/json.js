/**
 * JSON view: accessible, keyboard-operable tree with collapsible nodes,
 * syntax highlighting, live key/value search with auto-expand of matches,
 * and click-to-copy JSONPath + values.
 *
 * The RAW view always shows the exact body; this view is the parsed,
 * formatted representation. If the body is not valid JSON, this view says
 * so and points to RAW — it never reinterprets the body.
 */

import { el, clear, copyText } from '../ui/dom.js';
import { announce } from '../ui/announce.js';
import { findMatches, subtreeHasMatch } from '../core/jsonsearch.js';

const DEFAULT_EXPAND_DEPTH = 2;

/**
 * @param {*} value Parsed JSON value.
 * @param {{expandDepth?: number}} [opts]
 */
export function renderJsonTree(value, opts = {}) {
  const expandDepth = opts.expandDepth ?? DEFAULT_EXPAND_DEPTH;
  const root = el('div', { className: 'json-view' });

  const searchInput = el('input', {
    type: 'search',
    className: 'input json-search',
    placeholder: 'Filter keys & values…',
    'aria-label': 'Filter JSON keys and values',
    spellcheck: 'false',
  });
  const matchInfo = el('span', { className: 'json-match-info', role: 'status' });
  const treeMount = el('div', { className: 'json-tree' });

  const toolbar = el('div', { className: 'json-toolbar', role: 'group', 'aria-label': 'JSON tree controls' },
    searchInput, matchInfo,
    el('span', { className: 'json-toolbar-spacer' }),
    el('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => setAll(treeMount, true) }, 'Expand all'),
    el('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => setAll(treeMount, false) }, 'Collapse all'),
  );

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderTree(searchInput.value), 140);
  });

  let currentMatches = [];

  function renderTree(query) {
    const q = (query ?? '').trim();
    const { paths } = findMatches(value, q);
    currentMatches = paths;
    matchInfo.textContent = q ? `${paths.length}${paths.length >= 1000 ? '+' : ''} match${paths.length === 1 ? '' : 'es'}` : '';
    clear(treeMount);
    treeMount.append(buildNode(value, null, 0, '$', new Set(paths), q !== ''));
  }

  function setAll(container, expanded) {
    container.querySelectorAll('button.json-toggle').forEach((btn) => {
      const li = btn.closest('li');
      if (li) applyToggle(li, expanded);
    });
  }

  /** @param {HTMLElement} node @param {string} what */
  async function copyAndAnnounce(text, what) {
    const ok = await copyText(text);
    announce(ok ? `Copied ${what}.` : 'Copy failed.', {});
  }

  /**
   * @param {*} v @param {string|null} key @param {number} depth
   * @param {string} path @param {Set<string>} matchSet @param {boolean} searching
   */
  function buildNode(v, key, depth, path, matchSet, searching) {
    const keyNode = key === null ? null : el('span', {
      className: 'j-key',
      role: 'button',
      tabindex: '-1',
      title: `Click to copy path ${path}`,
      onClick: () => copyAndAnnounce(path, `path ${path}`),
    }, `"${key}"`, el('span', { className: 'j-punct' }, ': '));

    if (v !== null && typeof v === 'object') {
      const isArray = Array.isArray(v);
      const entries = isArray ? v.map((item, i) => [String(i), item]) : Object.entries(v);
      const open = isArray ? '[' : '{';
      const close = isArray ? ']' : '}';
      const summary = isArray ? `${v.length} items` : `${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`;

      const toggle = el('button', {
        type: 'button',
        className: 'json-toggle',
        'aria-expanded': 'false',
        'aria-label': `${key === null ? 'Root' : `Property ${key}`}: ${open}…${close}, ${summary}. Toggle.`,
      }, el('span', { className: 'j-caret', 'aria-hidden': 'true' }, '▸'), el('span', { className: 'j-punct' }, open));

      const childList = el('ul', { className: 'json-children', hidden: '' });
      for (const [childKey, childValue] of entries) {
        const childPath = isArray ? `${path}[${childKey}]` : `${path}.${childKey}`;
        childList.append(buildNode(childValue, isArray ? null : childKey, depth + 1, childPath, matchSet, searching));
      }
      const closePunct = el('span', { className: 'j-punct' }, close);
      const preview = el('span', { className: 'j-preview', 'aria-hidden': 'true' }, ` … ${summary} `);

      const li = el('li', { className: 'json-node' }, keyNode, toggle, preview, childList, closePunct);
      toggle.addEventListener('click', () => applyToggle(li, toggle.getAttribute('aria-expanded') !== 'true'));

      const shouldExpand = searching ? subtreeHasMatch(currentMatches, path) : depth < expandDepth;
      if (shouldExpand) applyToggle(li, true);
      return li;
    }

    const isHit = matchSet.has(path);
    const valueNode = renderPrimitive(v, isHit);
    valueNode.setAttribute('role', 'button');
    valueNode.setAttribute('tabindex', '-1');
    valueNode.title = 'Click to copy value';
    valueNode.addEventListener('click', () => copyAndAnnounce(JSON.stringify(v), 'value'));
    const liClass = `json-node json-leaf${isHit ? ' json-leaf-hit' : ''}`;
    return el('li', { className: liClass }, keyNode, valueNode);
  }

  renderTree('');
  root.append(toolbar, treeMount, el('p', { className: 'view-note json-hint' },
    'Tip: click a key to copy its path, click a value to copy it. Search auto-expands matches.'));
  return root;
}

function applyToggle(li, expanded) {
  const btn = li.querySelector(':scope > .json-toggle');
  const list = li.querySelector(':scope > .json-children');
  const preview = li.querySelector(':scope > .j-preview');
  const close = li.querySelector(':scope > .j-punct');
  if (!btn || !list) return;
  btn.setAttribute('aria-expanded', String(expanded));
  list.hidden = !expanded;
  const caret = btn.querySelector('.j-caret');
  if (caret) caret.textContent = expanded ? '▾' : '▸';
  if (preview) preview.hidden = expanded;
  if (close) close.hidden = !expanded;
}

function renderPrimitive(value, hit) {
  const cls = hit ? ' j-hit' : '';
  if (value === null) return el('span', { className: `j-null${cls}` }, 'null');
  switch (typeof value) {
    case 'string': return el('span', { className: `j-string${cls}` }, `"${value}"`);
    case 'number': return el('span', { className: `j-number${cls}` }, String(value));
    case 'boolean': return el('span', { className: `j-boolean${cls}` }, String(value));
    default: return el('span', { className: `j-null${cls}` }, String(value));
  }
}
