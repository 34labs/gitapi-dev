/**
 * GitAPITaker core data structures (JSDoc typedefs).
 *
 * This file has no runtime code. It documents the explicit shapes used
 * across the pipeline:
 *
 *   input URL -> provider detection -> URL parser -> resource identification
 *   -> provider resolver -> API endpoint builder -> request layer
 *   -> response inspector
 */

/**
 * A Git hosting resource identified from a website URL.
 * Produced by a provider adapter's `parse()` and consumed by its `resolve()`.
 * @typedef {object} ParsedResource
 * @property {string} providerId           Adapter id, e.g. "github".
 * @property {string} resourceType         e.g. "user" | "repo" | "issue" | "pull" | "commit" | ...
 * @property {Record<string, string>} params Resource-specific parameters (owner, repo, number, ref, path, ...).
 * @property {string} originalUrl          The normalized website URL this was parsed from.
 */

/**
 * A concrete API request the application is about to (or did) perform.
 * Built by a provider adapter's `resolve()` or by the endpoint explorer.
 * @typedef {object} ResolvedEndpoint
 * @property {string} providerId
 * @property {string} method               HTTP method. GitAPITaker only performs "GET".
 * @property {string} url                  Final absolute API URL.
 * @property {Record<string, string>} headers Headers GitAPITaker will set on the request.
 * @property {string} [resourceType]
 * @property {ParsedResource} [parsed]     The parsed web resource, when resolved from one.
 * @property {string} [label]              Human-readable label (used by the explorer).
 * @property {string} [docUrl]             Official documentation link for this endpoint.
 * @property {string[]} [notes]            Provider-specific mapping notes shown to the user.
 * @property {string} [instanceId]         Custom instance id when resolved against one.
 * @property {string} [apiBase]            API base URL actually used.
 */

/**
 * The outcome of one live fetch performed by the request layer.
 * Never fabricated: only values actually observed in the browser.
 * @typedef {object} ResponseRecord
 * @property {boolean} live                True when the browser actually contacted the provider.
 * @property {string} method
 * @property {string} url
 * @property {string} providerId
 * @property {number} status               HTTP status code.
 * @property {string} statusText
 * @property {Array<[string, string]>} headers Response headers as observed (CORS-exposed only).
 * @property {string} bodyText             Exact response body text as returned by Response.text().
 * @property {number} sizeBytes
 * @property {number} durationMs
 * @property {number} fetchedAt            Epoch millis.
 * @property {Record<string, string>} requestHeaders Headers that were set on the request.
 * @property {string} [contentType]
 */

/**
 * A structured cache record persisted in localStorage.
 * @typedef {object} CacheEntry
 * @property {string} key
 * @property {string} providerId
 * @property {string} method
 * @property {string} endpoint
 * @property {string} [webUrl]             The original Git hosting URL, when known.
 * @property {string} [resourceType]
 * @property {number} status
 * @property {string} statusText
 * @property {Array<[string, string]>} headers
 * @property {string} bodyText
 * @property {number} sizeBytes
 * @property {Record<string, string>} requestHeaders
 * @property {number} fetchedAt
 * @property {number} ttlMs                Freshness window used when the entry was written.
 */

/**
 * Request Guard decision for one cache key.
 * @typedef {object} GuardDecision
 * @property {'live'|'cache'} action
 * @property {string} reason               e.g. "first-request" | "cooldown" | "forced".
 * @property {number} suppressedCount      Repeat requests suppressed for this key in this session.
 * @property {number} [nextLiveAt]         Epoch millis when a non-forced live request is allowed again.
 */

/**
 * A history record. Intentionally small: never stores bodies or headers.
 * @typedef {object} HistoryEntry
 * @property {string} id
 * @property {number} at                   Epoch millis.
 * @property {string} providerId
 * @property {string} [resourceType]
 * @property {string} [webUrl]
 * @property {string} endpoint
 * @property {string} method
 * @property {number} [status]             Last observed status for this target.
 * @property {string} [stateLabel]         LIVE / CACHED / STALE of the last inspection.
 */

/**
 * A user-configured self-hosted instance (Gitea/Forgejo or GitLab).
 * @typedef {object} InstanceConfig
 * @property {string} id
 * @property {'gitea'|'gitlab'} kind
 * @property {string} label
 * @property {string} webBase              e.g. "https://git.example.org"
 * @property {string} apiBase              e.g. "https://git.example.org/api/v1"
 * @property {number} addedAt
 */

/**
 * A structured application error (resolver errors, invalid instances, ...).
 * @typedef {object} AppError
 * @property {string} code                 Machine-readable code, e.g. "unsupported-provider".
 * @property {string} message
 * @property {string[]} [hints]            Actionable suggestions shown to the user.
 */

/**
 * One JSON diff finding.
 * @typedef {object} DiffFinding
 * @property {string} path                 Dotted path, arrays indexed e.g. "items.3.name".
 * @property {'added'|'removed'|'changed'} type
 * @property {*} [before]
 * @property {*} [after]
 */

export {};
