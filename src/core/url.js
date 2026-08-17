/**
 * Input normalization and URL construction helpers.
 *
 * `normalizeInput()` accepts full URLs and reasonable shorthand forms and
 * returns a canonical https:// website URL. It throws ResolverError with
 * actionable hints for anything it refuses. Pure and deterministic.
 */

import { ResolverError, ResolverErrorCode } from './errors.js';

/** git@host:owner/repo(.git) — common SSH remote form. */
const SSH_FORM = /^git@([a-z0-9.-]+):(.+)$/i;

/**
 * Normalize user input into a URL object.
 * Accepted forms:
 *   - https://github.com/flessan
 *   - github.com/flessan            (scheme added)
 *   - www.github.com/flessan        (www stripped)
 *   - git@github.com:owner/repo.git (SSH remote form)
 * Query strings and fragments on website URLs are dropped.
 *
 * @param {string} input
 * @returns {URL}
 */
export function normalizeInput(input) {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new ResolverError(ResolverErrorCode.EMPTY_INPUT, 'No URL was provided.', [
      'Paste a Git hosting URL, for example https://github.com/flessan',
    ]);
  }

  const ssh = raw.match(SSH_FORM);
  if (ssh) {
    const candidate = new URL(`https://${ssh[1]}/${ssh[2]}`);
    return finalize(candidate, raw);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    const scheme = raw.slice(0, raw.indexOf(':'));
    throw new ResolverError(
      ResolverErrorCode.UNSUPPORTED_SCHEME,
      `URL scheme "${scheme}://" is not supported.`,
      ['GitAPITaker inspects https:// website URLs of Git hosting providers.', 'For SSH remotes, try the git@host:owner/repo.git form.'],
    );
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ResolverError(ResolverErrorCode.MALFORMED_URL, `"${truncate(raw, 80)}" is not a valid URL.`, [
      'Expected something like https://github.com/owner or https://gitlab.com/group/project',
    ]);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new ResolverError(ResolverErrorCode.UNSUPPORTED_SCHEME, `URL scheme "${url.protocol}" is not supported.`);
  }
  return finalize(url, raw);
}

function finalize(url, raw) {
  if (!url.hostname || !url.hostname.includes('.')) {
    throw new ResolverError(ResolverErrorCode.MALFORMED_URL, `"${truncate(raw, 80)}" does not contain a hostname.`, [
      'Provide a full host such as github.com, gitlab.com or gitea.com.',
    ]);
  }
  url.protocol = 'https:';
  if (url.hostname.startsWith('www.')) url.hostname = url.hostname.slice(4);
  url.search = '';
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

/**
 * Join a base URL with encoded path segments. Each segment is encoded
 * individually; pass-through encoding decisions belong to the adapters.
 * @param {string} base
 * @param {string[]} segments
 */
export function joinUrl(base, segments) {
  const url = new URL(base);
  const clean = segments.filter((s) => s !== undefined && s !== null && s !== '');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/' + clean.map((s) => String(s)).join('/');
  return url.toString();
}

/** Encode every path component of a possibly multi-segment ref/path (slashes kept). */
export function encodePathKeepingSlashes(value) {
  return String(value).split('/').map((part) => encodeURIComponent(part)).join('/');
}

/** Fully encode a value including slashes (GitLab project paths, tags). */
export function encodeFully(value) {
  return encodeURIComponent(String(value));
}

/** Validate a user-supplied base URL such as a custom API base. Returns URL or null. */
export function parseBaseUrl(input) {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
