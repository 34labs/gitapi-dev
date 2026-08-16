/** Keyboard interaction helpers (roving tabindex for lists). */

/**
 * Make a list navigable with ArrowUp/Down/Home/End, Enter/Space to activate.
 * @param {HTMLElement} container
 * @param {string} itemSelector
 * @param {{onActivate: (item: HTMLElement) => void}} hooks
 */
export function rovingList(container, itemSelector, hooks) {
  container.addEventListener('keydown', (event) => {
    const items = [...container.querySelectorAll(itemSelector)].filter((n) => !n.hidden && !n.disabled);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : Math.min(items.length - 1, current + 1);
    else if (event.key === 'ArrowUp') next = current < 0 ? 0 : Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next !== null) {
      event.preventDefault();
      setRoving(items, items[next]);
      items[next].focus();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault();
      hooks.onActivate(items[current]);
    }
  });
  const items = [...container.querySelectorAll(itemSelector)];
  if (items.length) setRoving(items, items[0]);
}

function setRoving(items, active) {
  for (const item of items) item.tabIndex = item === active ? 0 : -1;
}
