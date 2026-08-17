/**
 * Resolver pipeline: the only place that orchestrates
 *   input -> normalize -> detect provider -> parse -> resolve endpoint.
 *
 * Pure and DOM-free; safe to test in Node.
 */

import { normalizeInput } from './url.js';
import { detectProvider, unsupportedProviderError } from '../providers/registry.js';
import { listInstances } from '../providers/instances.js';
import { ResolverError, ResolverErrorCode } from './errors.js';

/**
 * Resolve user input to a concrete API endpoint.
 *
 * ResolverErrors thrown from here carry pipeline annotations:
 * `err.stage` ('input'|'detect'|'parse'|'resolve') and `err.context`
 * with whatever the pipeline had determined before failing — the UI
 * uses these to render an honest stage-by-stage failure view.
 *
 * @param {string} input
 * @param {{instances?: import('./types.js').InstanceConfig[]}} [opts]
 * @returns {{url: URL, provider: object, detection: object, parsed: import('./types.js').ParsedResource, endpoint: import('./types.js').ResolvedEndpoint}}
 * @throws {ResolverError}
 */
export function resolveInput(input, opts = {}) {
  const truncated = String(input ?? '').trim().slice(0, 64) || '(empty)';

  let url;
  try {
    url = normalizeInput(input);
  } catch (err) {
    if (err instanceof ResolverError) {
      err.stage = 'input';
      err.context = { input: truncated };
    }
    throw err;
  }

  const instances = opts.instances ?? safeListInstances();
  const detection = detectProvider(url, instances);
  if (!detection) {
    const err = unsupportedProviderError(url);
    err.stage = 'detect';
    err.context = { input: truncated, host: url.hostname };
    throw err;
  }

  let parsed;
  try {
    parsed = detection.provider.parse(url, detection.ctx);
  } catch (err) {
    if (err instanceof ResolverError) {
      err.stage = 'parse';
      err.context = { input: truncated, host: url.hostname, providerId: detection.provider.id };
    }
    throw err;
  }

  let endpoint;
  try {
    endpoint = detection.provider.resolve(parsed, detection.ctx);
  } catch (err) {
    if (err instanceof ResolverError) {
      err.stage = 'resolve';
      err.context = { input: truncated, host: url.hostname, providerId: detection.provider.id, parsed };
    }
    throw err;
  }

  if (!endpoint?.url || !endpoint.providerId || !endpoint.method) {
    const err = new ResolverError(ResolverErrorCode.MISSING_INFO, 'Provider adapter produced an incomplete endpoint.', [
      'This is a GitAPITaker bug — please report it with the URL you used.',
    ]);
    err.stage = 'resolve';
    err.context = { input: truncated, host: url.hostname, providerId: detection.provider.id, parsed };
    throw err;
  }
  return { url, provider: detection.provider, detection, parsed, endpoint };
}

/**
 * Build a ResolvedEndpoint from an Endpoint Explorer item.
 * Explorer items come from provider capability metadata (adapter.related()).
 *
 * @param {{url: string, label?: string, docUrl?: string, resourceType?: string}} item
 * @param {{provider: object, ctx: object}} detection
 */
export function endpointFromExplorerItem(item, detection) {
  return {
    providerId: detection.provider.id,
    method: 'GET',
    url: item.url,
    headers: detection.provider.requestHeaders ?? { Accept: 'application/json' },
    label: item.label,
    docUrl: item.docUrl,
    resourceType: item.resourceType,
    apiBase: detection.ctx.apiBase,
    instanceId: detection.ctx.instanceId,
    notes: ['Resolved from the Endpoint Explorer (provider capability metadata).'],
  };
}

function safeListInstances() {
  try {
    return listInstances();
  } catch {
    return [];
  }
}
