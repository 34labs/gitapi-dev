/**
 * M3 snackbar — brief visual confirmation for transient actions
 * (copies, theme changes). Screen-reader announcements stay separate;
 * the snackbar mirrors them visually.
 */

let hideTimer;

/** @param {string} message */
export function showSnackbar(message) {
  const bar = document.getElementById('snackbar');
  if (!bar) return;
  clearTimeout(hideTimer);
  bar.textContent = message;
  bar.hidden = false;
  hideTimer = setTimeout(() => { bar.hidden = true; }, 2600);
}
