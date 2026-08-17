/**
 * Community page: GitHub Discussions via Giscus.
 * The widget is lazy-loaded only when this page is visited, and only when
 * the configuration in src/community/config.js is complete.
 */

import { el, clear } from './dom.js';
import { GISCUS_CONFIG, isGiscusConfigured, giscusTerm } from '../community/config.js';

let loaded = false;

export function renderCommunityView() {
  const mount = document.getElementById('giscus-mount');
  clear(mount);

  if (!isGiscusConfigured()) {
    mount.append(
      el('p', { className: 'empty-note' },
        'The Giscus widget is not configured yet. GitAPITaker uses GitHub Discussions as its community backend; ',
        'the repository owner needs to enable Discussions and fill in the ids in ',
        el('code', { className: 'mono' }, 'src/community/config.js'),
        ' (instructions are in that file). (・_・;)'),
      el('p', {},
        el('a', { href: `https://github.com/${GISCUS_CONFIG.repo}/discussions`, target: '_blank', rel: 'noopener noreferrer' },
          'Open the repository discussions on GitHub'),
      ),
    );
    return;
  }

  if (loaded) {
    // Giscus re-mounts via postMessage when config changes; simplest honest
    // behavior is to recreate the script node on revisit.
    loaded = false;
  }
  const script = el('script', {
    src: 'https://giscus.app/client.js',
    'data-repo': GISCUS_CONFIG.repo,
    'data-repo-id': GISCUS_CONFIG.repoId,
    'data-category': GISCUS_CONFIG.category,
    'data-category-id': GISCUS_CONFIG.categoryId,
    'data-mapping': GISCUS_CONFIG.mapping,
    'data-strict': GISCUS_CONFIG.strict,
    'data-reactions-enabled': GISCUS_CONFIG.reactionsEnabled,
    'data-emit-metadata': GISCUS_CONFIG.emitMetadata,
    'data-input-position': GISCUS_CONFIG.inputPosition,
    'data-theme': GISCUS_CONFIG.theme,
    'data-lang': GISCUS_CONFIG.lang,
    'data-term': giscusTerm('general'),
    crossorigin: 'anonymous',
    async: '',
  });
  mount.append(script);
  loaded = true;
}
