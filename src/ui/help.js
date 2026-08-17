/** Keyboard shortcuts help dialog (opened via "?" or the command palette). */

import { announce } from './announce.js';

export function createHelp() {
  const dialog = document.getElementById('help-dialog');

  function open() {
    dialog.showModal();
    dialog.querySelector('.dialog-close')?.focus();
    announce('Keyboard shortcuts dialog opened.');
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  const closeBtn = dialog.querySelector('.dialog-close');
  closeBtn?.addEventListener('click', close);

  return { open, close };
}
