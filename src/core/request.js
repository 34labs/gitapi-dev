/**
 * Request layer.
 *
 * Every request goes DIRECTLY from the user's browser to the provider API.
 * There is no proxy, relay or GitAPITaker server in the middle. Nothing here
 * fabricates data: only values actually observed from fetch() are recorded.
 *
 * The layer is injectable (fetchImpl, timers) so it is fully testable
 * without live provider APIs.
 */

/** @type {number} hard timeout per request */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Execute a resolved endpoint.
 *
 * @param {import('./types.js').ResolvedEndpoint} endpoint
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number, now?: () => number}} [opts]
 * @returns {Promise<{ok: true, record: import('./types.js').ResponseRecord} | {ok: false, error: Error}>}
 */
export async function executeEndpoint(endpoint, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const now = opts.now ?? (() => Date.now());
  const timeOrigin = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const started = timeOrigin();

  try {
    const response = await fetchImpl(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.headers ?? {},
      signal: controller?.signal,
      // never send cookies/credentials to third-party APIs
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
    });

    const bodyText = await response.text();
    const durationMs = timeOrigin() - started;
    const headers = [];
    response.headers.forEach((value, key) => headers.push([key, value]));

    /** @type {import('./types.js').ResponseRecord} */
    const record = {
      live: true,
      method: endpoint.method,
      url: endpoint.url,
      providerId: endpoint.providerId,
      status: response.status,
      statusText: response.statusText || '',
      headers,
      bodyText,
      sizeBytes: byteLength(bodyText),
      durationMs,
      fetchedAt: now(),
      requestHeaders: { ...(endpoint.headers ?? {}) },
      contentType: response.headers.get('content-type') ?? undefined,
    };
    return { ok: true, record };
  } catch (err) {
    return { ok: false, error: err };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** UTF-8 byte length of a body string. */
export function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8'); // Node (tests)
}

/**
 * Try to parse a body as JSON. Returns {isJson, value} — never throws.
 * Empty bodies parse as non-JSON.
 */
export function tryParseJson(bodyText) {
  if (typeof bodyText !== 'string' || bodyText.trim() === '') return { isJson: false, value: undefined };
  try {
    return { isJson: true, value: JSON.parse(bodyText) };
  } catch {
    return { isJson: false, value: undefined };
  }
}
