/**
 * Gitea provider adapter (API v1) — also used for Forgejo instances.
 *
 * Built-in host: gitea.com. Self-hosted Gitea/Forgejo instances are matched
 * through the instance registry (see providers/instances.js) and may override
 * the API base, because not every deployment serves the API at the default
 * /api/v1 path.
 *
 * Routes verified against Gitea's own router (routers/api/v1/api.go):
 *   GET /repos/{owner}/{repo}/releases/tags/{tag}   (plural "tags")
 *   GET /repos/{owner}/{repo}/branches/{branch}
 *   GET /repos/{owner}/{repo}/pulls/{index}
 * Docs: https://docs.gitea.com/api/
 */

import { ResolverError, ResolverErrorCode } from '../core/errors.js';
import { joinUrl, encodePathKeepingSlashes, encodeFully } from '../core/url.js';

const DOCS = 'https://docs.gitea.com/api/';
const DEFAULT_API_SUFFIX = '/api/v1';

/** gitea.com top-level paths that are not user/org accounts. */
const RESERVED = new Set([
  'explore', 'assets', 'api', 'notifications', 'settings', 'user', 'issues',
  'pulls', 'events', 'dashboard', 'about', 'repos', 'stars', 'topics',
  'org', 'install', 'swagger',
]);

function requireNumber(value, what, url) {
  if (!/^\d+$/.test(String(value))) {
    throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `Gitea ${what} numbers must be numeric, got "${value}".`, [
      `Check the original URL: ${url}`,
    ]);
  }
  return value;
}

export const gitea = {
  id: 'gitea',
  name: 'Gitea',
  family: 'gitea',
  docsUrl: DOCS,
  defaultWebBase: 'https://gitea.com',
  defaultApiBase: `https://gitea.com${DEFAULT_API_SUFFIX}`,
  apiSuffixDefault: DEFAULT_API_SUFFIX,
  apiInfo: {
    versionLabel: 'API v1 (version is part of the base path /api/v1, not a request header)',
    mediaType: 'application/json',
    notes: [
      'Requests send Accept: application/json.',
      'Self-hosted Gitea/Forgejo instances usually expose interactive API docs at {instance}/api/swagger.',
    ],
  },
  requestHeaders: { Accept: 'application/json' },
  capabilities: {
    selfHosted: true,
    resources: [
      { type: 'user', label: 'User', webPattern: '/{username}', apiPattern: '/users/{username}' },
      { type: 'repo', label: 'Repository', webPattern: '/{owner}/{repo}', apiPattern: '/repos/{owner}/{repo}' },
      { type: 'issue', label: 'Issue', webPattern: '/{o}/{r}/issues/{n}', apiPattern: '/repos/{o}/{r}/issues/{n}' },
      { type: 'pull', label: 'Pull request', webPattern: '/{o}/{r}/pulls/{n}', apiPattern: '/repos/{o}/{r}/pulls/{n}' },
      { type: 'commit', label: 'Commit', webPattern: '/{o}/{r}/commit/{sha}', apiPattern: '/repos/{o}/{r}/git/commits/{sha}' },
      { type: 'commits', label: 'Commit list', webPattern: '/{o}/{r}/commits', apiPattern: '/repos/{o}/{r}/commits' },
      { type: 'releases', label: 'Releases', webPattern: '/{o}/{r}/releases', apiPattern: '/repos/{o}/{r}/releases' },
      { type: 'release-by-tag', label: 'Release by tag', webPattern: '/{o}/{r}/releases/tag/{tag}', apiPattern: '/repos/{o}/{r}/releases/tags/{tag}' },
      { type: 'release-latest', label: 'Latest release', webPattern: '(API only)', apiPattern: '/repos/{o}/{r}/releases/latest' },
      { type: 'branches', label: 'Branch list', webPattern: '/{o}/{r}/branches', apiPattern: '/repos/{o}/{r}/branches' },
      { type: 'branch', label: 'Branch', webPattern: '/{o}/{r}/src/branch/{branch}', apiPattern: '/repos/{o}/{r}/branches/{branch}' },
      { type: 'tags', label: 'Tag list', webPattern: '/{o}/{r}/tags', apiPattern: '/repos/{o}/{r}/tags' },
      { type: 'contents', label: 'File contents', webPattern: '/{o}/{r}/src/branch/{ref}/{path}', apiPattern: '/repos/{o}/{r}/contents/{path}?ref={ref}' },
    ],
    limitations: [
      'Web URLs use /src/branch/{branch}/{path}; GitAPITaker maps single-segment forms to branches and treats the first segment as the ref for files (heuristic).',
      'release-by-tag uses /releases/tags/{tag} (plural), which requires a reasonably recent Gitea/Forgejo version.',
      'Self-hosted instances must be registered under Providers before their URLs resolve.',
    ],
  },

  match(url) {
    return url.hostname === 'gitea.com';
  },

  /** @param {URL} url */
  parse(url) {
    const original = url.toString();
    let segs = url.pathname.split('/').filter(Boolean);
    if (segs.length > 0) segs[segs.length - 1] = segs[segs.length - 1].replace(/\.git$/, '');
    if (segs.length === 0) {
      throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, 'The Gitea homepage does not map to a single API resource.', [
        'Provide a user or repository URL, e.g. https://gitea.com/gitea/gitea',
      ]);
    }

    if (segs.length === 1) {
      const name = segs[0];
      if (RESERVED.has(name.toLowerCase())) {
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `"/${name}" is a site page on this Gitea instance, not an API resource.`);
      }
      return mk('user', { username: name }, original);
    }

    const owner = segs[0];
    if (RESERVED.has(owner.toLowerCase())) {
      throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `"/${owner}/…" is not a repository path on this Gitea instance.`);
    }
    const repo = segs[1];
    if (segs.length === 2) return mk('repo', { owner, repo }, original);

    const kind = segs[2];
    const rest = segs.slice(3);
    switch (kind) {
      case 'issues':
        if (rest.length === 0) return mk('issues', { owner, repo }, original);
        return mk('issue', { owner, repo, number: requireNumber(rest[0], 'issue', original) }, original);
      case 'pulls':
        if (rest.length === 0) return mk('pulls', { owner, repo }, original);
        return mk('pull', { owner, repo, number: requireNumber(rest[0], 'pull request', original) }, original);
      case 'commit':
        return mk('commit', { owner, repo, sha: rest[0] }, original);
      case 'commits':
        if (rest.length > 0 && rest[0] === 'branch') return mk('commits', { owner, repo, ref: rest.slice(1).join('/') || undefined }, original);
        return mk('commits', { owner, repo }, original);
      case 'releases':
        if (rest.length === 0) return mk('releases', { owner, repo }, original);
        if (rest[0] === 'tag') {
          if (rest.length < 2) throw new ResolverError(ResolverErrorCode.MISSING_INFO, 'Missing tag name after /releases/tag/.');
          return mk('release-by-tag', { owner, repo, tag: rest.slice(1).join('/') }, original);
        }
        if (rest[0] === 'latest') return mk('release-latest', { owner, repo }, original);
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `Unsupported Gitea releases path "/releases/${rest[0]}".`);
      case 'tags':
        return mk('tags', { owner, repo }, original);
      case 'branches':
        return mk('branches', { owner, repo }, original);
      case 'src': {
        // Gitea web browsing URLs: /src/branch/{branch}[/{path...}]
        if (rest[0] === 'branch') {
          if (rest.length === 2) return mk('branch', { owner, repo, branch: rest[1] }, original);
          if (rest.length > 2) {
            return mk('contents', { owner, repo, ref: rest[1], path: rest.slice(2).join('/') }, original);
          }
        }
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, 'This Gitea browsing URL could not be mapped (expected /src/branch/{branch}[/{path}]).');
      }
      default:
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `Gitea path "/${owner}/${repo}/${kind}" has no API mapping in GitAPITaker yet.`, [
          `See the official docs for what exists: ${DOCS}`,
        ]);
    }
  },

  /**
   * @param {import('../core/types.js').ParsedResource} parsed
   * @param {{apiBase: string, instanceId?: string}} ctx
   */
  resolve(parsed, ctx) {
    const api = ctx.apiBase.replace(/\/+$/, '');
    const p = parsed.params;
    const common = {
      providerId: 'gitea',
      method: 'GET',
      parsed,
      headers: { Accept: 'application/json' },
      apiBase: api,
      instanceId: ctx.instanceId,
      notes: [],
    };
    const repoBase = () => joinUrl(api, ['repos', p.owner, p.repo]);

    switch (parsed.resourceType) {
      case 'user':
        return { ...common, resourceType: 'user', url: joinUrl(api, ['users', p.username]), docUrl: DOCS, label: `Gitea user ${p.username}` };
      case 'repo':
        return { ...common, resourceType: 'repo', url: repoBase(), docUrl: DOCS, label: `Repository ${p.owner}/${p.repo}` };
      case 'issue':
        return { ...common, resourceType: 'issue', url: joinUrl(repoBase(), ['issues', p.number]), docUrl: DOCS, label: `Issue #${p.number}` };
      case 'issues':
        return { ...common, resourceType: 'issues', url: joinUrl(repoBase(), ['issues']), docUrl: DOCS, label: `Issues of ${p.owner}/${p.repo}` };
      case 'pull':
        return { ...common, resourceType: 'pull', url: joinUrl(repoBase(), ['pulls', p.number]), docUrl: DOCS, label: `Pull request #${p.number}` };
      case 'pulls':
        return { ...common, resourceType: 'pulls', url: joinUrl(repoBase(), ['pulls']), docUrl: DOCS, label: `Pull requests of ${p.owner}/${p.repo}` };
      case 'commit':
        return { ...common, resourceType: 'commit', url: joinUrl(repoBase(), ['git', 'commits', p.sha]), docUrl: DOCS, label: `Commit ${p.sha.slice(0, 10)}` };
      case 'commits': {
        let url = joinUrl(repoBase(), ['commits']);
        if (p.ref) url += `?sha=${encodeURIComponent(p.ref)}`;
        return { ...common, resourceType: 'commits', url, docUrl: DOCS, label: `Commits of ${p.owner}/${p.repo}` };
      }
      case 'releases':
        return { ...common, resourceType: 'releases', url: joinUrl(repoBase(), ['releases']), docUrl: DOCS, label: `Releases of ${p.owner}/${p.repo}` };
      case 'release-by-tag':
        return {
          ...common, resourceType: 'release-by-tag', url: joinUrl(repoBase(), ['releases', 'tags', encodePathKeepingSlashes(p.tag)]), docUrl: DOCS, label: `Release ${p.tag}`,
          notes: ['Requires Gitea ≥ 1.14 / recent Forgejo; older instances may not serve /releases/tags/{tag}.'],
        };
      case 'release-latest':
        return { ...common, resourceType: 'release-latest', url: joinUrl(repoBase(), ['releases', 'latest']), docUrl: DOCS, label: `Latest release of ${p.owner}/${p.repo}` };
      case 'branches':
        return { ...common, resourceType: 'branches', url: joinUrl(repoBase(), ['branches']), docUrl: DOCS, label: `Branches of ${p.owner}/${p.repo}` };
      case 'branch':
        return { ...common, resourceType: 'branch', url: joinUrl(repoBase(), ['branches', encodePathKeepingSlashes(p.branch)]), docUrl: DOCS, label: `Branch ${p.branch}` };
      case 'tags':
        return { ...common, resourceType: 'tags', url: joinUrl(repoBase(), ['tags']), docUrl: DOCS, label: `Tags of ${p.owner}/${p.repo}` };
      case 'contents': {
        const url = new URL(joinUrl(repoBase(), ['contents', encodePathKeepingSlashes(p.path)]));
        url.searchParams.set('ref', p.ref);
        return {
          ...common, resourceType: 'contents', url: url.toString(), docUrl: DOCS, label: `File ${p.path}`,
          notes: ['Gitea browsing URLs mix ref and path; the first path segment after /src/branch was taken as the ref.'],
        };
      }
      default:
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `Gitea resource type "${parsed.resourceType}" cannot be resolved.`);
    }
  },

  /** @param {import('../core/types.js').ParsedResource} parsed @param {{apiBase: string}} ctx */
  related(parsed, ctx) {
    const api = ctx.apiBase.replace(/\/+$/, '');
    const p = parsed.params;
    const item = (label, url, resourceType) => ({ label, url, docUrl: DOCS, resourceType });
    const users = (sub) => joinUrl(api, ['users', p.username, sub]);
    const repos = (sub) => joinUrl(api, ['repos', p.owner, p.repo, ...(sub ? sub.split('/') : [])]);

    switch (parsed.resourceType) {
      case 'user':
        return [
          item(`Repositories of ${p.username}`, users('repos'), 'repos'),
          item(`Followers of ${p.username}`, users('followers'), 'followers'),
          item(`Followed by ${p.username}`, users('following'), 'following'),
          item(`Organizations of ${p.username}`, users('orgs'), 'orgs'),
          item(`Starred by ${p.username}`, users('starred'), 'starred'),
        ];
      case 'repo':
        return [
          item('Issues', repos('issues'), 'issues'),
          item('Pull requests', repos('pulls'), 'pulls'),
          item('Commits', repos('commits'), 'commits'),
          item('Releases', repos('releases'), 'releases'),
          item('Branches', repos('branches'), 'branches'),
          item('Tags', repos('tags'), 'tags'),
          item('Root contents', repos('contents'), 'contents'),
          item('Forks', repos('forks'), 'forks'),
          item('Stargazers', repos('stargazers'), 'stargazers'),
        ];
      case 'issue':
        return [item(`Comments on #${p.number}`, repos(`issues/${p.number}/comments`), 'comments')];
      case 'pull':
        return [
          item(`Commits in #${p.number}`, repos(`pulls/${p.number}/commits`), 'commits'),
          item(`Files in #${p.number}`, repos(`pulls/${p.number}/files`), 'files'),
          item(`Comments on #${p.number}`, repos(`pulls/${p.number}/comments`), 'comments'),
        ];
      default:
        return [];
    }
  },

  describe(parsed) {
    const p = parsed.params;
    switch (parsed.resourceType) {
      case 'user': return `Gitea user "${p.username}"`;
      case 'repo': return `Gitea repository ${p.owner}/${p.repo}`;
      case 'issue': return `issue ${p.owner}/${p.repo}#${p.number}`;
      case 'pull': return `pull request ${p.owner}/${p.repo}#${p.number}`;
      case 'commit': return `commit ${p.sha.slice(0, 10)} of ${p.owner}/${p.repo}`;
      default: return `${parsed.resourceType} of ${p.owner ? `${p.owner}/${p.repo}` : p.username ?? ''}`;
    }
  },
};

/** Convenience export for self-hosted Forgejo — same adapter, distinct label. */
export const forgejo = gitea;

function mk(resourceType, params, originalUrl) {
  return { providerId: 'gitea', resourceType, params, originalUrl };
}
