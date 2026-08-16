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
 * @param {string} input
 * @param {{instances?: import('./types.js').InstanceConfig[]}} [opts]
 * @returns {{url: URL, provider: object, detection: object, parsed: import('./types.js').ParsedResource, endpoint: import('./types.js').ResolvedEndpoint}}
 * @throws {ResolverError}
 */
export function resolveInput(input, opts = {}) {
  const url = normalizeInput(input);
  const instances = opts.instances ?? safeListInstances();
  const detection = detectProvider(url, instances);
  if (!detection) throw unsupportedProviderError(url);

  const parsed = detection.provider.parse(url, detection.ctx);
  const endpoint = detection.provider.resolve(parsed, detection.ctx);
  if (!endpoint?.url || !endpoint.providerId || !endpoint.method) {
    throw new ResolverError(ResolverErrorCode.MISSING_INFO, 'Provider adapter produced an incomplete endpoint.', [
      'This is a GitAPITaker bug — please report it with the URL you used.',
    ]);
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
