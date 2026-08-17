/**
 * Provider registry.
 *
 * Detection is separated from parsing and endpoint resolution:
 *   detectProvider(url, instances)  -> which adapter owns this host
 *   adapter.parse(url, ctx)         -> ParsedResource
 *   adapter.resolve(parsed, ctx)    -> ResolvedEndpoint
 *
 * Adding a provider = add one adapter module, register it here, done.
 * The rest of the application (resolver, request layer, cache, guard,
 * inspector, explorer) is provider-agnostic.
 */

import { github } from './github.js';
import { gitlab } from './gitlab.js';
import { gitea } from './gitea.js';
import { ResolverError, ResolverErrorCode } from '../core/errors.js';

const builtIns = new Map();

/** Register a provider adapter. */
export function registerProvider(adapter) {
  if (!adapter?.id || typeof adapter.parse !== 'function' || typeof adapter.resolve !== 'function') {
    throw new Error('Invalid provider adapter: id, parse() and resolve() are required.');
  }
  builtIns.set(adapter.id, adapter);
}

registerProvider(github);
registerProvider(gitlab);
registerProvider(gitea);

/** @returns {import('../core/types.js').ProviderAdapter[]} */
export function listProviders() {
  return [...builtIns.values()];
}

/** @param {string} id */
export function getProvider(id) {
  return builtIns.get(id) ?? null;
}

/**
 * Detect which provider adapter owns a normalized URL.
 * Built-in hosts win; then user-registered instances, matched by hostname.
 *
 * @param {URL} url
 * @param {import('../core/types.js').InstanceConfig[]} [instances]
 * @returns {{provider: object, ctx: {webBase: string, apiBase: string, instanceId?: string, instanceLabel?: string}} | null}
 */
export function detectProvider(url, instances = []) {
  for (const adapter of builtIns.values()) {
    if (typeof adapter.match === 'function' && adapter.match(url)) {
      return {
        provider: adapter,
        ctx: { webBase: adapter.defaultWebBase, apiBase: adapter.defaultApiBase },
      };
    }
  }
  for (const inst of instances) {
    try {
      if (new URL(inst.webBase).hostname === url.hostname) {
        const adapter = builtIns.get(inst.kind);
        if (!adapter) continue;
        return {
          provider: adapter,
          ctx: { webBase: inst.webBase, apiBase: inst.apiBase, instanceId: inst.id, instanceLabel: inst.label },
        };
      }
    } catch { /* ignore malformed stored instance */ }
  }
  return null;
}

/**
 * Detection-only failure used by the resolver.
 * @param {URL} url
 */
export function unsupportedProviderError(url) {
  const supported = [...builtIns.values()].map((p) => p.defaultWebBase.replace('https://', '')).join(', ');
  return new ResolverError(ResolverErrorCode.UNSUPPORTED_PROVIDER, `No provider adapter recognizes the host "${url.hostname}".`, [
    `Built-in providers: ${supported}.`,
    'Self-hosted Gitea, Forgejo or GitLab? Register the instance under Providers → Custom instances.',
    'Adding a new provider adapter is documented in the README (provider adapter architecture).',
  ], [
    { label: 'Register a self-hosted instance', goto: 'providers' },
  ]);
}
