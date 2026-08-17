/**
 * Providers page: official documentation links, capability overview per
 * provider, and the custom-instance manager for self-hosted Gitea/Forgejo
 * and GitLab. Capability tables are rendered from adapter metadata — this
 * page has no hardcoded resource lists of its own.
 */

import { el, clear } from './dom.js';
import { listProviders } from '../providers/registry.js';
import { listInstances, addInstance, removeInstance, probeInstance } from '../providers/instances.js';
import { ResolverError } from '../core/errors.js';
import { announce } from './announce.js';

export function renderProvidersView() {
  const container = document.getElementById('page-providers');
  const cards = container.querySelector('#provider-cards');
  clear(cards);
  for (const provider of listProviders()) {
    cards.append(renderProviderCard(provider));
  }
  renderInstanceManager(container.querySelector('#instance-manager'));
}

function renderProviderCard(provider) {
  const cap = provider.capabilities;
  const card = el('article', { className: 'provider-card', 'aria-labelledby': `provider-${provider.id}-title` },
    el('header', { className: 'provider-card-head' },
      el('h2', { id: `provider-${provider.id}-title` }, provider.name),
      el('a', { href: provider.docsUrl, target: '_blank', rel: 'noopener noreferrer', className: 'm3-btn outlined btn-sm' }, 'Official API docs'),
    ),
    el('dl', { className: 'kv-list' },
      el('dt', {}, 'Default web host'), el('dd', { className: 'mono' }, provider.defaultWebBase),
      el('dt', {}, 'API base'), el('dd', { className: 'mono' }, provider.defaultApiBase),
      el('dt', {}, 'API version'), el('dd', {}, provider.apiInfo.versionLabel),
      el('dt', {}, 'Self-hosted support'), el('dd', {}, cap.selfHosted ? 'Yes — register instances below' : 'No (built-in host only)'),
    ),
  );

  const table = el('table', { className: 'kv-table' },
    el('caption', { className: 'sr-only' }, `${provider.name} resources GitAPITaker can resolve`),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, 'Resource'),
      el('th', { scope: 'col' }, 'Website URL'),
      el('th', { scope: 'col' }, 'API endpoint'),
    )),
  );
  const tbody = el('tbody');
  for (const resource of cap.resources) {
    tbody.append(el('tr', {},
      el('td', {}, resource.label),
      el('td', { className: 'mono' }, resource.webPattern),
      el('td', { className: 'mono' }, resource.apiPattern),
    ));
  }
  table.append(tbody);
  card.append(el('h3', { className: 'view-subhead' }, 'Supported resources'), table);

  if (cap.limitations?.length) {
    card.append(el('h3', { className: 'view-subhead' }, 'Known limitations'),
      el('ul', { className: 'note-list' }, cap.limitations.map((l) => el('li', {}, l))));
  }

  card.append(el('p', { className: 'provider-discuss' },
    discussLink(provider.id, provider.name)));
  return card;
}

/** Contextual link into GitHub Discussions (community backend). */
export function discussLink(providerId, providerName) {
  const title = encodeURIComponent(`[provider:${providerId}] Mapping feedback / behavior notes`);
  const url = `https://github.com/34labs/gitapi-dev/discussions/new?category=providers&title=${title}`;
  return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' },
    `Discuss ${providerName} mappings in the community`);
}

function renderInstanceManager(mount) {
  clear(mount);
  const instances = listInstances();

  const form = el('form', { className: 'instance-form' },
    el('div', { className: 'form-grid' },
      labeled('Kind', el('select', { id: 'inst-kind', className: 'input' },
        el('option', { value: 'gitea' }, 'Gitea / Forgejo'),
        el('option', { value: 'gitlab' }, 'GitLab (self-managed)'),
      )),
      labeled('Instance URL', el('input', {
        id: 'inst-web', type: 'url', className: 'input mono', required: '',
        placeholder: 'https://git.example.org', 'aria-describedby': 'inst-help',
      })),
      labeled('API base (optional)', el('input', {
        id: 'inst-api', type: 'url', className: 'input mono',
        placeholder: 'auto: {instance}/api/v1 or /api/v4',
      })),
      labeled('Label (optional)', el('input', { id: 'inst-label', type: 'text', className: 'input', placeholder: 'work gitlab' })),
    ),
    el('p', { id: 'inst-help', className: 'view-note' },
      'Instances are stored in this browser only. The API base defaults to {instance}/api/v1 (Gitea/Forgejo) or {instance}/api/v4 (GitLab); override it only if your deployment differs.'),
    el('div', { className: 'btn-row' },
      el('button', { type: 'submit', className: 'm3-btn filled' }, 'Add instance'),
      el('button', { type: 'button', className: 'm3-btn outlined', id: 'inst-probe' }, 'Add + verify'),
    ),
    el('p', { id: 'inst-result', className: 'view-note', role: 'status' }),
  );

  form.addEventListener('submit', (event) => { event.preventDefault(); submit(false); });
  form.querySelector('#inst-probe').addEventListener('click', () => submit(true));

  async function submit(withProbe) {
    const result = form.querySelector('#inst-result');
    result.textContent = '';
    try {
      const entry = addInstance({
        kind: form.querySelector('#inst-kind').value,
        label: form.querySelector('#inst-label').value,
        webBase: form.querySelector('#inst-web').value,
        apiBase: form.querySelector('#inst-api').value,
      });
      if (withProbe) {
        result.textContent = 'Verifying…';
        const probe = await probeInstance(entry);
        result.textContent = `${probe.ok ? 'Verified.' : 'Not verified.'} ${probe.detail}${probe.status ? ` (HTTP ${probe.status})` : ''}`;
        announce(result.textContent, { assertive: !probe.ok });
      } else {
        result.textContent = `Saved ${entry.label}. Resolve URLs like ${entry.webBase}/owner/repo now.`;
        announce(result.textContent);
      }
      form.querySelector('#inst-web').value = '';
      form.querySelector('#inst-api').value = '';
      form.querySelector('#inst-label').value = '';
      renderInstanceList(mount.querySelector('#instance-list'));
    } catch (err) {
      if (err instanceof ResolverError) {
        result.textContent = err.message;
        announce(`Could not add instance: ${err.message}`, { assertive: true });
      } else {
        throw err;
      }
    }
  }

  mount.append(el('h2', {}, 'Custom instances (self-hosted)'), form, el('div', { id: 'instance-list' }));
  renderInstanceList(mount.querySelector('#instance-list'));
}

function renderInstanceList(mount) {
  clear(mount);
  const instances = listInstances();
  if (instances.length === 0) {
    mount.append(el('p', { className: 'empty-note' }, 'No custom instances registered.'));
    return;
  }
  const list = el('ul', { className: 'instance-list' });
  for (const inst of instances) {
    const row = el('li', { className: 'instance-row' },
      el('span', { className: 'm3-chip chip-provider' }, inst.kind),
      el('strong', {}, inst.label),
      el('code', { className: 'mono' }, inst.webBase),
      el('span', { className: 'view-note' }, `API: ${inst.apiBase}`),
      el('button', { type: 'button', className: 'm3-btn text btn-sm btn-danger', 'aria-label': `Remove instance ${inst.label}` }, 'Remove'),
    );
    row.querySelector('button').addEventListener('click', () => {
      removeInstance(inst.id);
      renderInstanceList(mount);
      announce(`Instance ${inst.label} removed.`);
    });
    list.append(row);
  }
  mount.append(list);
}

function labeled(labelText, control) {
  const id = control.id;
  return el('label', { className: 'field', for: id }, el('span', { className: 'field-label' }, labelText), control);
}
