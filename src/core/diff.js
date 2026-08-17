/**
 * Response Diff — structural JSON comparison.
 *
 * Pure function: never mutates its inputs. Arrays are compared by index
 * (documented in the UI). Output is capped so huge payloads stay usable.
 */

const MAX_FINDINGS = 500;
const MAX_DEPTH = 24;

/**
 * @param {*} a Older value (parsed JSON).
 * @param {*} b Newer value (parsed JSON).
 * @returns {import('./types.js').DiffFinding[]}
 */
export function diffJson(a, b) {
  const findings = [];
  walk('$', a, b, 0, findings);
  return findings;
}

function walk(path, a, b, depth, findings) {
  if (findings.length >= MAX_FINDINGS) return;
  if (depth > MAX_DEPTH) {
    if (!Object.is(a, b)) findings.push({ path, type: 'changed', before: summarize(a), after: summarize(b) });
    return;
  }
  if (Object.is(a, b)) return;

  const aIsObj = isPlainObject(a);
  const bIsObj = isPlainObject(b);
  if (aIsObj && bIsObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      const sub = `${path}.${key}`;
      if (!(key in a)) findings.push({ path: sub, type: 'added', after: summarize(b[key]) });
      else if (!(key in b)) findings.push({ path: sub, type: 'removed', before: summarize(a[key]) });
      else walk(sub, a[key], b[key], depth + 1, findings);
      if (findings.length >= MAX_FINDINGS) return;
    }
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const sub = `${path}.${i}`;
      if (i >= a.length) findings.push({ path: sub, type: 'added', after: summarize(b[i]) });
      else if (i >= b.length) findings.push({ path: sub, type: 'removed', before: summarize(a[i]) });
      else walk(sub, a[i], b[i], depth + 1, findings);
      if (findings.length >= MAX_FINDINGS) return;
    }
    if (a.length !== b.length) {
      findings.push({ path: `${path}.length`, type: 'changed', before: a.length, after: b.length });
    }
    return;
  }

  findings.push({ path, type: 'changed', before: summarize(a), after: summarize(b) });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Compact representation for findings display. */
export function summarize(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  if (isPlainObject(value)) return `{…} ${Object.keys(value).length} keys`;
  if (Array.isArray(value)) return `[…] ${value.length} items`;
  return value;
}
