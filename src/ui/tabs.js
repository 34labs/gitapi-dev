/**
 * Accessible tabs (WAI-ARIA APG pattern): arrow keys move and activate,
 * Home/End jump, panels are lazily rendered on activation.
 */

import { el, clear } from './dom.js';

/**
 * @param {{id: string, label: string, render: (panel: HTMLElement) => void}[]} tabs
 * @param {{ariaLabel?: string, onSelect?: (id: string) => void}} [opts]
 */
export function createTabs(tabs, opts = {}) {
  const root = el('div', { className: 'tabs' });
  const tablist = el('div', { className: 'tablist', role: 'tablist', 'aria-label': opts.ariaLabel ?? 'Response views' });
  const panelWrap = el('div', { className: 'tab-panels' });
  root.append(tablist, panelWrap);

  const buttons = new Map();
  const panels = new Map();
  const rendered = new Set();
  let selectedId = null;

  tabs.forEach((tab, i) => {
    const btn = el('button', {
      type: 'button',
      role: 'tab',
      id: `tab-${tab.id}`,
      className: 'tab',
      'aria-controls': `panel-${tab.id}`,
      'aria-selected': 'false',
      tabindex: i === 0 ? '0' : '-1',
      dataset: { tabId: tab.id },
    }, tab.label);
    btn.addEventListener('click', () => select(tab.id));
    buttons.set(tab.id, btn);

    const panel = el('section', {
      role: 'tabpanel',
      id: `panel-${tab.id}`,
      className: 'tab-panel',
      tabindex: '0',
      'aria-labelledby': `tab-${tab.id}`,
      hidden: '',
    });
    panels.set(tab.id, panel);
    tablist.append(btn);
    panelWrap.append(panel);
  });

  tablist.addEventListener('keydown', (event) => {
    const ids = tabs.map((t) => t.id);
    const current = ids.indexOf(selectedId ?? ids[0]);
    let next = null;
    if (event.key === 'ArrowRight') next = (current + 1) % ids.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(ids[next]);
    buttons.get(ids[next]).focus();
  });

  /** @param {string} id */
  function select(id) {
    selectedId = id;
    for (const tab of tabs) {
      const active = tab.id === id;
      const btn = buttons.get(tab.id);
      const panel = panels.get(tab.id);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
      if (active && !rendered.has(tab.id)) {
        rendered.add(tab.id);
        clear(panel);
        tab.render(panel);
      }
    }
    opts.onSelect?.(id);
  }

  /** Re-render all panels (used after a new response arrives). */
  function invalidate() {
    rendered.clear();
    if (selectedId) {
      const tab = tabs.find((t) => t.id === selectedId);
      if (tab) {
        const panel = panels.get(selectedId);
        clear(panel);
        rendered.add(selectedId);
        tab.render(panel);
      }
    }
  }

  select(tabs[0].id);
  return { root, select, invalidate, get selectedId() { return selectedId; } };
}
