/**
 * Custom (self-hosted) instances.
 *
 * Users can register self-hosted Gitea/Forgejo or GitLab instances so their
 * website URLs resolve. Configuration lives entirely in localStorage and is
 * never transmitted anywhere.
 */

import { readJson, writeJson, getStorage } from '../core/storage.js';
import { parseBaseUrl } from '../core/url.js';
import { ResolverError, ResolverErrorCode } from '../core/errors.js';
import { getProvider, listProviders } from './registry.js';

const KEY = 'gitapitaker.instances.v1';

/** @returns {import('../core/types.js').InstanceConfig[]} */
export function listInstances() {
  const value = readJson(KEY);
  return Array.isArray(value) ? value : [];
}

/** Hosts already owned by built-in adapters cannot be re-registered. */
function builtInHosts() {
  return listProviders().map((p) => new URL(p.defaultWebBase).hostname);
}

/**
 * Add or replace an instance for a given host.
 * @param {{kind: string, label?: string, webBase: string, apiBase?: string}} input
 * @returns {import('../core/types.js').InstanceConfig}
 */
export function addInstance(input) {
  const adapter = getProvider(input.kind);
  if (!adapter || !adapter.capabilities?.selfHosted) {
    throw new ResolverError(ResolverErrorCode.INVALID_INSTANCE, `Provider "${input.kind}" does not support self-hosted instances in GitAPITaker.`);
  }
  const web = parseBaseUrl(input.webBase);
  if (!web) {
    throw new ResolverError(ResolverErrorCode.INVALID_INSTANCE, 'Instance base URL is not a valid http(s) URL.', [
      'Example: https://git.example.org',
    ]);
  }
  if (builtInHosts().includes(web.hostname)) {
    throw new ResolverError(ResolverErrorCode.INVALID_INSTANCE, `"${web.hostname}" is a built-in provider host and cannot be overridden.`);
  }

  let api;
  if (input.apiBase && input.apiBase.trim()) {
    const parsedApi = parseBaseUrl(input.apiBase);
    if (!parsedApi) {
      throw new ResolverError(ResolverErrorCode.INVALID_INSTANCE, 'Custom API base is not a valid http(s) URL.', [
        `Example: ${web.origin}${adapter.apiSuffixDefault}`,
      ]);
    }
    api = parsedApi.toString().replace(/\/+$/, '');
  } else {
    api = `${web.origin}${adapter.apiSuffixDefault}`;
  }

  const instances = listInstances().filter((i) => {
    try { return new URL(i.webBase).hostname !== web.hostname; } catch { return true; }
  });
  const entry = {
    id: `inst-${web.hostname}-${adapter.id}`,
    kind: adapter.id,
    label: input.label?.trim() || web.hostname,
    webBase: web.origin,
    apiBase: api,
    addedAt: Date.now(),
  };
  instances.push(entry);
  if (!writeJson(KEY, instances)) {
    throw new ResolverError(ResolverErrorCode.INVALID_INSTANCE, 'Could not persist the instance (browser storage unavailable).');
  }
  return entry;
}

/** @param {string} id */
export function removeInstance(id) {
  writeJson(KEY, listInstances().filter((i) => i.id !== id));
}

/**
 * Verify an instance is reachable and answers like the expected API.
 * Honest probing: we report whatever status comes back; nothing is faked.
 *   - Gitea/Forgejo: GET {apiBase}/version (public)
 *   - GitLab: GET {apiBase}/version (usually 401 unauthenticated, which still
 *     proves the API exists at that base)
 *
 * @param {import('../core/types.js').InstanceConfig} instance
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ok: boolean, status: number|null, detail: string}>}
 */
export async function probeInstance(instance, fetchImpl = globalThis.fetch) {
  const url = `${instance.apiBase.replace(/\/+$/, '')}/version`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (instance.kind === 'gitlab') {
      const ok = res.status === 401 || res.status === 200;
      return {
        ok,
        status: res.status,
        detail: ok
          ? 'API reachable at this base (GitLab /version requires auth; 401 confirms the API exists).'
          : `Unexpected status ${res.status} from ${url}.`,
      };
    }
    if (res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.version ? `Gitea/Forgejo version ${body.version}` : 'version endpoint answered';
      } catch { detail = 'version endpoint answered (non-JSON body)'; }
      return { ok: true, status: res.status, detail };
    }
    return { ok: false, status: res.status, detail: `${url} answered ${res.status} ${res.statusText}` };
  } catch {
    return { ok: false, status: null, detail: 'No response — host unreachable, offline, or CORS blocked the probe.' };
  }
}

/** Test hook. */
export function clearInstancesForTests() {
  getStorage().remove(KEY);
}
