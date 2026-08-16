/**
 * Fetch mocks for request-layer tests. No live provider API is ever called.
 * The mock honors AbortSignal so timeouts are testable.
 */

/**
 * @param {object|Function} responder  A response spec or (url, init) => spec.
 *   Spec: {status?, statusText?, headers?: Record<string,string>, body?: string, error?: Error, delayMs?: number}
 */
export function createFetchMock(responder) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const spec = typeof responder === 'function' ? responder(url, init) : responder;
    if (spec.delayMs) await sleep(spec.delayMs, init.signal);
    if (spec.error) throw spec.error;

    const headerMap = new Map(Object.entries(spec.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const status = spec.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      statusText: spec.statusText ?? '',
      headers: {
        get: (k) => headerMap.get(String(k).toLowerCase()) ?? null,
        forEach: (cb) => headerMap.forEach((v, k) => cb(v, k)),
      },
      text: async () => spec.body ?? '',
      json: async () => JSON.parse(spec.body ?? 'null'),
    };
  };
  fn.calls = calls;
  return fn;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
}

/** A fetch that always throws a TypeError, like the browser does on network/CORS failure. */
export function failingFetch() {
  return createFetchMock({ error: new TypeError('Failed to fetch') });
}
