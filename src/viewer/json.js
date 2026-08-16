/**
 * JSON view: renders parsed JSON as an accessible, keyboard-operable tree
 * with collapsible objects/arrays and syntax highlighting.
 *
 * The RAW view always shows the exact body; this view is the parsed,
 * formatted representation. If the body is not valid JSON, this view says
 * so and points to RAW — it never reinterprets the body.
 */

import { el } from '../ui/dom.js';

const DEFAULT_EXPAND_DEPTH = 2;

/**
 * @param {*} value Parsed JSON value.
 * @param {{expandDepth?: number}} [opts]
 */
export function renderJsonTree(value, opts = {}) {
  const expandDepth = opts.expandDepth ?? DEFAULT_EXPAND_DEPTH;
  const root = el('div', { className: 'json-view' });
  const toolbar = el('div', { className: 'json-toolbar', role: 'group', 'aria-label': 'JSON tree controls' },
    el('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => setAll(root, true) }, 'Expand all'),
    el('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => setAll(root, false) }, 'Collapse all'),
  );
  root.append(toolbar, buildNode(value, null, 0, expandDepth));
  return root;
}

function setAll(root, expanded) {
  root.querySelectorAll('button.json-toggle').forEach((btn) => {
    const li = btn.closest('li');
    if (!li) return;
    applyToggle(li, expanded);
  });
}

/** @param {*} value @param {string|null} key @param {number} depth @param {number} expandDepth */
function buildNode(value, key, depth, expandDepth) {
  const keyNode = key === null ? null : el('span', { className: 'j-key' }, `"${key}"`, el('span', { className: 'j-punct' }, ': '));

  if (value !== null && typeof value === 'object') {
    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    const open = isArray ? '[' : '{';
    const close = isArray ? ']' : '}';
    const summary = isArray ? `${value.length} items` : `${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`;

    const toggle = el('button', {
      type: 'button',
      className: 'json-toggle',
      'aria-expanded': 'false',
      'aria-label': `${key === null ? 'Root' : `Property ${key}`}: ${open}…${close}, ${summary}. Toggle.`,
    }, el('span', { className: 'j-caret', 'aria-hidden': 'true' }, '▸'), el('span', { className: 'j-punct' }, open));

    const childList = el('ul', { className: 'json-children', hidden: '' });
    for (const [childKey, childValue] of entries) {
      // Array items render without an index key, like conventional JSON trees.
      childList.append(buildNode(childValue, isArray ? null : childKey, depth + 1, expandDepth));
    }
    const closePunct = el('span', { className: 'j-punct' }, close);
    const preview = el('span', { className: 'j-preview', 'aria-hidden': 'true' }, ` … ${summary} `);

    const li = el('li', { className: 'json-node' },
      keyNode, toggle, preview, childList, closePunct,
    );

    toggle.addEventListener('click', () => applyToggle(li, toggle.getAttribute('aria-expanded') !== 'true'));
    if (depth < expandDepth) applyToggle(li, true);
    return li;
  }

  const valueNode = renderPrimitive(value);
  return el('li', { className: 'json-node json-leaf' }, keyNode, valueNode);
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

function renderPrimitive(value) {
  if (value === null) return el('span', { className: 'j-null' }, 'null');
  switch (typeof value) {
    case 'string': return el('span', { className: 'j-string' }, `"${value}"`);
    case 'number': return el('span', { className: 'j-number' }, String(value));
    case 'boolean': return el('span', { className: 'j-boolean' }, String(value));
    default: return el('span', { className: 'j-null' }, String(value));
  }
}
