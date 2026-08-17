/**
 * Giscus / GitHub Discussions configuration.
 *
 * GitAPITaker is fully static — the community backend IS GitHub Discussions,
 * embedded through the official giscus.app client. No forum backend exists
 * in this project.
 *
 * SETUP (one-time, by the repository owner):
 *   1. Enable Discussions on https://github.com/34labs/gitapi-dev
 *   2. Install the GitHub App: https://github.com/apps/giscus
 *   3. Create at least these discussion categories:
 *        - "Providers"  (Announcement or Discussion category)
 *        - "Q&A"        (Announcement category with "Q&A" enabled)
 *   4. Visit https://giscus.app, fill in the repository, and copy the
 *      repository id and category ids into the constants below.
 *
 * Until the ids are filled in, the community page shows these instructions
 * instead of embedding a broken widget — nothing is faked.
 */

export const GISCUS_CONFIG = {
  repo: '34labs/gitapi-dev',
  repoId: '',                 // e.g. 'R_kgDO...'  (from giscus.app)
  category: 'Providers',
  categoryId: '',             // e.g. 'DIC_kwDO...'  (from giscus.app)
  mapping: 'specific',        // one discussion per app section, keyed by term
  strict: '1',
  reactionsEnabled: '1',
  emitMetadata: '0',
  inputPosition: 'top',
  theme: 'preferred_color_scheme',
  lang: 'en',
};

export function isGiscusConfigured() {
  return Boolean(GISCUS_CONFIG.repoId && GISCUS_CONFIG.categoryId);
}

/** Per-section discussion term used with mapping=specific. */
export function giscusTerm(section) {
  return `gitapitaker-community:${section}`;
}
