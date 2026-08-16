/** Minimal DOM helpers for the presentation layer. */

/**
 * Create an element.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]  className, dataset, aria-*, event handlers via on*
 * @param {...(Node|string)} children
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'className') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v; // only used with trusted, app-generated escaped HTML
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Remove all children. @param {Node} node */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Copy text to clipboard with a fallback; resolves true on success. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = el('textarea', { className: 'sr-only', value: text });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Format a key/value pair list for copying. */
export function pairsToText(pairs) {
  return pairs.map(([k, v]) => `${k}: ${v}`).join('\n');
}
