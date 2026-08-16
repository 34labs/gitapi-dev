/**
 * Request Guard.
 *
 * A local, transparent safety mechanism that suppresses rapid repeated
 * requests for the same endpoint and serves them from the local cache
 * instead. It is NOT an attempt to bypass provider rate limits — provider
 * limits still apply to every live request that does go out.
 *
 * State is session-local (in memory): the guard protects against bursts in
 * the current visit; the cache provides cross-session protection.
 */

/** Default cooldown: repeated identical requests within this window are suppressed. */
export const DEFAULT_COOLDOWN_MS = 10_000;

/**
 * @param {{now?: () => number, cooldownMs?: number}} [opts]
 */
export function createGuard(opts = {}) {
  const now = opts.now ?? (() => Date.now());
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  /** @type {Map<string, {lastLiveAt: number, suppressed: number}>} */
  const state = new Map();

  return {
    cooldownMs,

    /**
     * Decide whether a request for `key` should go live or be served from cache.
     * @param {string} key
     * @param {{force?: boolean}} [opts]
     * @returns {import('./types.js').GuardDecision}
     */
    decide(key, { force = false } = {}) {
      const entry = state.get(key);
      const t = now();
      if (force) {
        return { action: 'live', reason: 'forced', suppressedCount: entry?.suppressed ?? 0 };
      }
      if (entry && t - entry.lastLiveAt < cooldownMs) {
        return {
          action: 'cache',
          reason: 'cooldown',
          suppressedCount: entry.suppressed + 1,
          nextLiveAt: entry.lastLiveAt + cooldownMs,
        };
      }
      return { action: 'live', reason: entry ? 'cooldown-expired' : 'first-request', suppressedCount: entry?.suppressed ?? 0 };
    },

    /** Record that a live request went out for `key`. */
    recordLive(key) {
      state.set(key, { lastLiveAt: now(), suppressed: state.get(key)?.suppressed ?? 0 });
    },

    /** Record that a repeat request for `key` was suppressed. */
    recordSuppressed(key) {
      const entry = state.get(key);
      if (entry) entry.suppressed += 1;
    },

    /** Inspection helper for the UI. */
    describe(key) {
      const entry = state.get(key);
      if (!entry) return { suppressed: 0, lastLiveAt: null, cooldownMs };
      return { suppressed: entry.suppressed, lastLiveAt: entry.lastLiveAt, cooldownMs };
    },

    reset() { state.clear(); },
  };
}
