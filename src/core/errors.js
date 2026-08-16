/**
 * Error model for GitAPITaker.
 *
 * Three families of errors are always kept distinct:
 *   1. Resolver errors  — GitAPITaker could not map the input to an endpoint.
 *   2. Provider errors  — the provider answered with an HTTP error status.
 *      The provider's own body is shown unchanged; anything we add is clearly
 *      labeled as an *interpretation*.
 *   3. Browser/network errors — the request never reached an HTTP response
 *      (DNS failure, offline, CORS block, timeout, abort).
 */

/** Error codes produced by the resolver/parser layer. */
export const ResolverErrorCode = Object.freeze({
  EMPTY_INPUT: 'empty-input',
  MALFORMED_URL: 'malformed-url',
  UNSUPPORTED_SCHEME: 'unsupported-scheme',
  UNSUPPORTED_PROVIDER: 'unsupported-provider',
  UNSUPPORTED_RESOURCE: 'unsupported-resource',
  MISSING_INFO: 'missing-info',
  INVALID_INSTANCE: 'invalid-instance',
});

/**
 * Structured error thrown by URL normalization, provider detection,
 * parsing and endpoint resolution. Never used for provider HTTP errors.
 */
export class ResolverError extends Error {
  /**
   * @param {string} code  One of ResolverErrorCode.
   * @param {string} message
   * @param {string[]} [hints]
   */
  constructor(code, message, hints = []) {
    super(message);
    this.name = 'ResolverError';
    this.code = code;
    this.hints = hints;
  }
}

/**
 * Interpret a provider HTTP error status. The result is always labeled as
 * GitAPITaker's interpretation in the UI — it never replaces or overrides
 * the provider's own response body.
 *
 * @param {number} status
 * @param {string} providerId
 * @param {Array<[string, string]>} [headers] Observed response headers.
 * @param {import('./types.js').ParsedResource} [parsed]
 * @returns {{title: string, causes: string[], actions: string[]} | null}
 */
export function interpretHttpStatus(status, providerId, headers = [], parsed = undefined) {
  const headerMap = new Map(headers.map(([k, v]) => [k.toLowerCase(), v]));
  const rateRemaining = headerMap.get('x-ratelimit-remaining');
  const rateReset = headerMap.get('x-ratelimit-reset');
  const resetHint = rateReset && /^\d+$/.test(rateReset)
    ? `Rate limit window resets at ${new Date(Number(rateReset) * 1000).toISOString()}.`
    : null;

  if (status === 429 || (status === 403 && rateRemaining === '0')) {
    return {
      title: `HTTP ${status}: rate limited by ${providerId}`,
      causes: [
        'Too many requests were made to this provider API from your network.',
        'This is enforced by the provider itself — GitAPITaker cannot and will not bypass it.',
      ],
      actions: [
        resetHint ?? 'Wait for the provider rate-limit window to reset, then try again.',
        'Use the cached copy (Cache inspector) instead of re-requesting while limited.',
      ],
    };
  }

  switch (status) {
    case 400:
      return {
        title: `HTTP 400: ${providerId} rejected the request as malformed`,
        causes: ['The endpoint or one of its parameters is not valid for this provider.'],
        actions: ['Check the resolved endpoint in the REQUEST view against the provider documentation.'],
      };
    case 401:
      return {
        title: `HTTP 401: ${providerId} requires authentication for this resource`,
        causes: [
          'The resource is private, or this endpoint requires a token.',
          'GitAPITaker v0.1 performs unauthenticated requests only.',
        ],
        actions: ['Verify the resource is public.', 'Authentication support is planned; see About/Security.'],
      };
    case 403:
      return {
        title: `HTTP 403: ${providerId} refused the request`,
        causes: [
          'The resource may be private.',
          'A provider-side rate limit or abuse detection may be active.',
          'The endpoint may require authentication or additional scopes.',
        ],
        actions: ['Inspect the HEADERS view for rate-limit or policy hints returned by the provider.'],
      };
    case 404: {
      const causes = ['The resource does not exist at this endpoint.', 'The resource is private and hidden without authentication.'];
      const actions = ['Double-check the original URL and spelling.'];
      if (providerId === 'github' && parsed?.resourceType === 'user') {
        causes.push(`"${parsed.params.login}" may be an organization rather than a user. GitHub keeps separate endpoints: /users/{login} and /orgs/{org}.`);
        actions.push(`Try the org endpoint: https://api.github.com/orgs/${parsed.params.login}`);
      }
      if (providerId === 'gitlab' && parsed?.resourceType === 'project') {
        causes.push('GitLab project lookups use the full URL-encoded namespace path; a moved or renamed project changes the path.');
      }
      return { title: `HTTP 404: ${providerId} did not find this resource`, causes, actions };
    }
    case 409:
      return {
        title: `HTTP 409: conflict reported by ${providerId}`,
        causes: ['The resource state conflicts with the request (often empty repositories or conflicting refs).'],
        actions: ['The provider body above usually names the conflicting resource.'],
      };
    case 422:
      return {
        title: `HTTP 422: ${providerId} rejected the request semantics`,
        causes: ['The request was understood but failed provider-side validation.'],
        actions: ['Read the provider error body for the specific validation failure.'],
      };
    default:
      if (status >= 500) {
        return {
          title: `HTTP ${status}: ${providerId} server error`,
          causes: ['The provider API itself failed. This is not a GitAPITaker or local network problem.'],
          actions: ['Retry later.', 'Check the provider status page if it persists.'],
        };
      }
      return null;
  }
}

/**
 * Classify a failed fetch (no HTTP response was produced).
 * @param {Error} err
 * @param {{online?: boolean}} [env]
 * @returns {{title: string, causes: string[], actions: string[]}}
 */
export function interpretFetchFailure(err, env = {}) {
  const name = err?.name ?? '';
  const online = env.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  if (name === 'AbortError') {
    return {
      title: 'Request timed out or was aborted',
      causes: ['The provider did not answer within the configured timeout, or the request was cancelled.'],
      actions: ['Try again.', 'If a cached copy exists it can be inspected offline from the Cache inspector.'],
    };
  }
  if (!online) {
    return {
      title: 'Browser appears to be offline',
      causes: ['No network connection is available, so the provider could not be contacted.'],
      actions: ['Previously cached responses remain inspectable — open the Cache inspector.'],
    };
  }
  return {
    title: 'Network or CORS failure — the provider never answered',
    causes: [
      'DNS failure, unreachable host, or the connection was blocked.',
      'The provider (or self-hosted instance) may not allow cross-origin browser requests (CORS). Public github.com / gitlab.com / gitea.com APIs do; some self-hosted instances do not.',
    ],
    actions: [
      'Open DevTools → Network for the underlying browser error.',
      'For self-hosted instances, ask the administrator to enable CORS for the API, or inspect a cached copy.',
    ],
  };
}
