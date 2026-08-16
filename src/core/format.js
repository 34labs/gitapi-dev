/** Small deterministic formatting helpers shared by UI and tests. */

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** @param {number} ms */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** @param {number} epochMs */
export function formatTimestamp(epochMs) {
  if (!Number.isFinite(epochMs)) return '—';
  return new Date(epochMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** Human relative age, e.g. "12 s ago", "4 min ago". @param {number} epochMs @param {number} [now] */
export function formatAge(epochMs, now = Date.now()) {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Truncate for compact lists (never used for RAW view bodies). */
export function truncateMiddle(s, max = 72) {
  const str = String(s);
  if (str.length <= max) return str;
  const half = Math.floor((max - 1) / 2);
  return `${str.slice(0, half)}…${str.slice(str.length - half)}`;
}
