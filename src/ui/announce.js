/**
 * Screen-reader announcements for request state changes (start, complete,
 * error, cached, suppressed). Polite by default; errors use the assertive
 * region. Visual UI mirrors every announcement — nothing is announced
 * invisibly that is not also shown.
 */

/** @param {string} message @param {{assertive?: boolean}} [opts] */
export function announce(message, opts = {}) {
  const id = opts.assertive ? 'sr-assertive' : 'sr-polite';
  const node = document.getElementById(id);
  if (!node) return;
  // Re-announce identical text by toggling content in the next frame.
  node.textContent = '';
  setTimeout(() => { node.textContent = message; }, 30);
}
