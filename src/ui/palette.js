/**
 * Command palette (Ctrl/Cmd+K). Fully keyboard navigable:
 * filter by typing, ArrowUp/Down, Enter to run, Escape to close.
 * Uses a native <dialog> for focus containment.
 */

import { el, clear } from './dom.js';
import { announce } from './announce.js';

/**
 * @param {{getActions: () => Array<{id: string, label: string, hint?: string, keywords?: string, run: () => void}>}} hooks
 */
export function createPalette(hooks) {
  const dialog = document.getElementById('palette-dialog');
  const input = dialog.querySelector('#palette-input');
  const list = dialog.querySelector('#palette-list');
  const emptyNote = dialog.querySelector('#palette-empty');
  let visible = [];

  function render(filterText) {
    const q = (filterText ?? '').trim().toLowerCase();
    const actions = hooks.getActions();
    visible = actions.filter((a) =>
      !q
      || a.label.toLowerCase().includes(q)
      || (a.keywords ?? '').toLowerCase().includes(q));
    clear(list);
    for (const action of visible) {
      const item = el('button', {
        type: 'button',
        className: 'palette-item',
        role: 'option',
        'aria-selected': 'false',
        dataset: { actionId: action.id },
      },
      el('span', { className: 'palette-label' }, action.label),
      action.hint ? el('kbd', { className: 'palette-hint' }, action.hint) : null,
      );
      item.addEventListener('click', () => runAction(action));
      list.append(item);
    }
    emptyNote.hidden = visible.length > 0;
    updateActive(0);
  }

  function items() { return [...list.querySelectorAll('.palette-item')]; }

  function activeIndex() {
    return items().findIndex((n) => n.classList.contains('active'));
  }

  function updateActive(index) {
    const all = items();
    all.forEach((n, i) => {
      n.classList.toggle('active', i === index);
      n.setAttribute('aria-selected', String(i === index));
      n.tabIndex = i === index ? 0 : -1;
    });
    all[index]?.scrollIntoView({ block: 'nearest' });
  }

  function runAction(action) {
    close();
    try {
      action.run();
    } catch (err) {
      announce(`Action failed: ${err.message}`, { assertive: true });
    }
  }

  function open() {
    if (dialog.open) return;
    dialog.showModal();
    input.value = '';
    render('');
    input.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  input.addEventListener('input', () => render(input.value));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (document.activeElement === input || items().includes(document.activeElement)) {
      const all = items();
      const current = activeIndex();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        updateActive(Math.min(all.length - 1, current + 1));
        all[activeIndex()]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        updateActive(Math.max(0, current - 1));
        all[activeIndex()]?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const idx = activeIndex();
        const action = visible[idx >= 0 ? idx : 0];
        if (action) runAction(action);
      }
    }
  });

  // Click on backdrop closes.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  return { open, close, isOpen: () => dialog.open };
}
