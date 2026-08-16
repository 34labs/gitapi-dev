/**
 * GitHub provider adapter (REST API v2022-11-28).
 *
 * Owns all GitHub-specific knowledge: which website hosts match, how website
 * paths map to resources, and how those resources map to api.github.com
 * endpoints. Docs: https://docs.github.com/en/rest
 */

import { ResolverError, ResolverErrorCode } from '../core/errors.js';
import { joinUrl, encodePathKeepingSlashes } from '../core/url.js';

const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const ACCEPT = 'application/vnd.github+json';
const DOCS = 'https://docs.github.com/en/rest';

/** Top-level github.com paths that are never user accounts. */
const RESERVED = new Set([
  'orgs', 'topics', 'collections', 'search', 'features', 'marketplace', 'sponsors',
  'settings', 'notifications', 'new', 'login', 'join', 'signup', 'about', 'pricing',
  'security', 'enterprise', 'explore', 'events', 'trending', 'readmes', 'nonprofit',
  'site', 'contact', 'blog', 'business', 'partners', 'press', 'legal', 'careers',
  'support', 'integrations', 'stars', 'pulls', 'issues', 'codespaces', 'copilot',
  'organizations', 'users', 'account', 'dashboard', 'watching', 'premium',
]);

const DOCS_BY_RESOURCE = {
  user: `${DOCS}/users/users#get-a-user`,
  org: `${DOCS}/orgs/orgs#get-an-organization`,
  repo: `${DOCS}/repos/repos#get-a-repository`,
  issue: `${DOCS}/issues/issues#get-an-issue`,
  issues: `${DOCS}/issues/issues#list-repository-issues`,
  pull: `${DOCS}/pulls/pulls#get-a-pull-request`,
  pulls: `${DOCS}/pulls/pulls#list-pull-requests`,
  commit: `${DOCS}/commits/commits#get-a-commit`,
  commits: `${DOCS}/commits/commits#list-commits`,
  releases: `${DOCS}/releases/releases#list-releases`,
  'release-by-tag': `${DOCS}/releases/releases#get-a-release-by-tag-name`,
  'release-latest': `${DOCS}/releases/releases#get-the-latest-release`,
  branches: `${DOCS}/branches/branches#list-branches`,
  branch: `${DOCS}/branches/branches#get-a-branch`,
  tags: `${DOCS}/repos/repos#list-repository-tags`,
  contents: `${DOCS}/repos/contents#get-repository-content`,
};

function requireNumber(value, what, url) {
  if (!/^\d+$/.test(String(value))) {
    throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `GitHub ${what} numbers must be numeric, got "${value}".`, [
      `Check the original URL: ${url}`,
    ]);
  }
  return value;
}

export const github = {
  id: 'github',
  name: 'GitHub',
  family: 'github',
  docsUrl: DOCS,
  defaultWebBase: 'https://github.com',
  defaultApiBase: API_BASE,
  apiInfo: {
    versionLabel: `REST API, version header X-GitHub-Api-Version: ${API_VERSION}`,
    mediaType: ACCEPT,
    notes: ['Requests send Accept: application/vnd.github+json and X-GitHub-Api-Version: 2022-11-28.'],
  },
  requestHeaders: { Accept: ACCEPT, 'X-GitHub-Api-Version': API_VERSION },
  capabilities: {
    selfHosted: false,
    resources: [
      { type: 'user', label: 'User', webPattern: '/{login}', apiPattern: '/users/{login}' },
      { type: 'org', label: 'Organization', webPattern: '/orgs/{org}', apiPattern: '/orgs/{org}' },
      { type: 'repo', label: 'Repository', webPattern: '/{owner}/{repo}', apiPattern: '/repos/{owner}/{repo}' },
      { type: 'issue', label: 'Issue', webPattern: '/{o}/{r}/issues/{n}', apiPattern: '/repos/{o}/{r}/issues/{n}' },
      { type: 'pull', label: 'Pull request', webPattern: '/{o}/{r}/pull/{n}', apiPattern: '/repos/{o}/{r}/pulls/{n}' },
      { type: 'commit', label: 'Commit', webPattern: '/{o}/{r}/commit/{sha}', apiPattern: '/repos/{o}/{r}/commits/{sha}' },
      { type: 'commits', label: 'Commit list', webPattern: '/{o}/{r}/commits', apiPattern: '/repos/{o}/{r}/commits' },
      { type: 'releases', label: 'Releases', webPattern: '/{o}/{r}/releases', apiPattern: '/repos/{o}/{r}/releases' },
      { type: 'release-by-tag', label: 'Release by tag', webPattern: '/{o}/{r}/releases/tag/{tag}', apiPattern: '/repos/{o}/{r}/releases/tags/{tag}' },
      { type: 'release-latest', label: 'Latest release', webPattern: '/{o}/{r}/releases/latest', apiPattern: '/repos/{o}/{r}/releases/latest' },
      { type: 'branches', label: 'Branch list', webPattern: '/{o}/{r}/branches', apiPattern: '/repos/{o}/{r}/branches' },
      { type: 'branch', label: 'Branch', webPattern: '/{o}/{r}/tree/{branch}', apiPattern: '/repos/{o}/{r}/branches/{branch}' },
      { type: 'tags', label: 'Tag list', webPattern: '/{o}/{r}/tags', apiPattern: '/repos/{o}/{r}/tags' },
      { type: 'contents', label: 'File contents', webPattern: '/{o}/{r}/blob/{ref}/{path}', apiPattern: '/repos/{o}/{r}/contents/{path}?ref={ref}' },
    ],
    limitations: [
      'github.com/{name} is ambiguous between users and organizations; GitAPITaker resolves it to /users/{name} and suggests /orgs/{name} when a 404 comes back.',
      'Wiki, Projects, Actions, Discussions and Security pages have no direct mapping yet.',
      'tree/blob URLs mix a git ref and a path; the first segment after blob is treated as the ref (heuristic).',
    ],
  },

  match(url) {
    return url.hostname === 'github.com';
  },

  /** @param {URL} url */
  parse(url) {
    const segs = url.pathname.split('/').filter(Boolean);
    const original = url.toString();
    if (segs.length === 0) {
      throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, 'The github.com homepage does not map to a single API resource.', [
        'Provide a user, organization or repository URL, e.g. https://github.com/flessan',
      ]);
    }

    if (segs[0] === 'orgs') {
      if (segs.length < 2) throw new ResolverError(ResolverErrorCode.MISSING_INFO, 'Missing organization name after /orgs/.');
      return mk('org', { org: segs[1] }, original);
    }
    if (segs.length === 1) {
      const login = segs[0];
      if (RESERVED.has(login.toLowerCase())) {
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `"github.com/${login}" is a GitHub site page, not an API resource.`);
      }
      return mk('user', { login }, original);
    }

    const owner = segs[0];
    if (RESERVED.has(owner.toLowerCase())) {
      throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `"github.com/${owner}/…" is not a repository path GitHub exposes via this API.`);
    }
    const repo = segs[1].replace(/\.git$/, '');
    if (segs.length === 2) return mk('repo', { owner, repo }, original);

    const kind = segs[2];
    const rest = segs.slice(3);
    switch (kind) {
      case 'issues':
        if (rest.length === 0) return mk('issues', { owner, repo }, original);
        return mk('issue', { owner, repo, number: requireNumber(rest[0], 'issue', original) }, original);
      case 'pulls':
        return mk('pulls', { owner, repo }, original);
      case 'pull':
        return mk('pull', { owner, repo, number: requireNumber(rest[0], 'pull request', original) }, original);
      case 'commit':
        return mk('commit', { owner, repo, sha: rest[0] }, original);
      case 'commits':
        if (rest.length > 0) return mk('commit', { owner, repo, sha: rest[0] }, original);
        return mk('commits', { owner, repo }, original);
      case 'releases':
        if (rest.length === 0) return mk('releases', { owner, repo }, original);
        if (rest[0] === 'tag') {
          if (rest.length < 2) throw new ResolverError(ResolverErrorCode.MISSING_INFO, 'Missing tag name after /releases/tag/.');
          return mk('release-by-tag', { owner, repo, tag: rest.slice(1).join('/') }, original);
        }
        if (rest[0] === 'latest') return mk('release-latest', { owner, repo }, original);
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `Unsupported GitHub releases path "/releases/${rest[0]}".`);
      case 'tags':
        return mk('tags', { owner, repo }, original);
      case 'branches':
        return mk('branches', { owner, repo }, original);
      case 'tree': {
        if (rest.length === 1) return mk('branch', { owner, repo, branch: rest[0] }, original);
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, 'GitHub tree URLs mix a branch name and a directory path, which cannot be split unambiguously without git data.', [
          'Inspect the branch list instead, or the specific file via its blob URL.',
        ]);
      }
      case 'blob': {
        if (rest.length < 2) throw new ResolverError(ResolverErrorCode.MISSING_INFO, 'Blob URLs need a ref and a file path, e.g. /blob/main/README.md');
        return mk('contents', { owner, repo, ref: rest[0], path: rest.slice(1).join('/') }, original);
      }
      default:
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `GitHub path "/${owner}/${repo}/${kind}" has no API mapping in GitAPITaker yet.`, [
          'Wiki, Actions, Projects, Discussions and Security pages are not mapped.',
          `See the official docs for what exists: ${DOCS}`,
        ]);
    }
  },

  /** @param {import('../core/types.js').ParsedResource} parsed */
  resolve(parsed) {
    const p = parsed.params;
    const common = {
      providerId: 'github',
      method: 'GET',
      parsed,
      headers: { Accept: ACCEPT, 'X-GitHub-Api-Version': API_VERSION },
      apiBase: API_BASE,
      notes: [],
    };
    const repoBase = () => joinUrl(API_BASE, ['repos', p.owner, p.repo]);
    switch (parsed.resourceType) {
      case 'user':
        return { ...common, resourceType: 'user', url: joinUrl(API_BASE, ['users', p.login]), docUrl: DOCS_BY_RESOURCE.user, label: `GitHub user ${p.login}` };
      case 'org':
        return { ...common, resourceType: 'org', url: joinUrl(API_BASE, ['orgs', p.org]), docUrl: DOCS_BY_RESOURCE.org, label: `GitHub org ${p.org}` };
      case 'repo':
        return { ...common, resourceType: 'repo', url: repoBase(), docUrl: DOCS_BY_RESOURCE.repo, label: `Repository ${p.owner}/${p.repo}` };
      case 'issue':
        return { ...common, resourceType: 'issue', url: joinUrl(repoBase(), ['issues', p.number]), docUrl: DOCS_BY_RESOURCE.issue, label: `Issue #${p.number}` };
      case 'issues':
        return { ...common, resourceType: 'issues', url: joinUrl(repoBase(), ['issues']), docUrl: DOCS_BY_RESOURCE.issues, label: `Issues of ${p.owner}/${p.repo}` };
      case 'pull':
        return { ...common, resourceType: 'pull', url: joinUrl(repoBase(), ['pulls', p.number]), docUrl: DOCS_BY_RESOURCE.pull, label: `Pull request #${p.number}` };
      case 'pulls':
        return { ...common, resourceType: 'pulls', url: joinUrl(repoBase(), ['pulls']), docUrl: DOCS_BY_RESOURCE.pulls, label: `Pull requests of ${p.owner}/${p.repo}` };
      case 'commit':
        return { ...common, resourceType: 'commit', url: joinUrl(repoBase(), ['commits', p.sha]), docUrl: DOCS_BY_RESOURCE.commit, label: `Commit ${p.sha.slice(0, 10)}` };
      case 'commits':
        return { ...common, resourceType: 'commits', url: joinUrl(repoBase(), ['commits']), docUrl: DOCS_BY_RESOURCE.commits, label: `Commits of ${p.owner}/${p.repo}` };
      case 'releases':
        return { ...common, resourceType: 'releases', url: joinUrl(repoBase(), ['releases']), docUrl: DOCS_BY_RESOURCE.releases, label: `Releases of ${p.owner}/${p.repo}` };
      case 'release-by-tag':
        return { ...common, resourceType: 'release-by-tag', url: joinUrl(repoBase(), ['releases', 'tags', encodePathKeepingSlashes(p.tag)]), docUrl: DOCS_BY_RESOURCE['release-by-tag'], label: `Release ${p.tag}` };
      case 'release-latest':
        return { ...common, resourceType: 'release-latest', url: joinUrl(repoBase(), ['releases', 'latest']), docUrl: DOCS_BY_RESOURCE['release-latest'], label: `Latest release of ${p.owner}/${p.repo}` };
      case 'branches':
        return { ...common, resourceType: 'branches', url: joinUrl(repoBase(), ['branches']), docUrl: DOCS_BY_RESOURCE.branches, label: `Branches of ${p.owner}/${p.repo}` };
      case 'branch':
        return { ...common, resourceType: 'branch', url: joinUrl(repoBase(), ['branches', encodePathKeepingSlashes(p.branch)]), docUrl: DOCS_BY_RESOURCE.branch, label: `Branch ${p.branch}` };
      case 'tags':
        return { ...common, resourceType: 'tags', url: joinUrl(repoBase(), ['tags']), docUrl: DOCS_BY_RESOURCE.tags, label: `Tags of ${p.owner}/${p.repo}` };
      case 'contents': {
        const url = new URL(joinUrl(repoBase(), ['contents', encodePathKeepingSlashes(p.path)]));
        url.searchParams.set('ref', p.ref);
        return {
          ...common, resourceType: 'contents', url: url.toString(), docUrl: DOCS_BY_RESOURCE.contents, label: `File ${p.path}`,
          notes: ['blob URLs mix ref and path; the first path segment after /blob was taken as the ref.'],
        };
      }
      default:
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `GitHub resource type "${parsed.resourceType}" cannot be resolved.`);
    }
  },

  /**
   * Endpoint Explorer data: related resources for an already-parsed resource.
   * Purely capability-metadata driven; the UI renders whatever this returns.
   */
  related(parsed) {
    const p = parsed.params;
    const item = (label, url, docUrl, resourceType) => ({ label, url, docUrl, resourceType });
    const users = (sub) => joinUrl(API_BASE, ['users', p.login, sub]);
    const repos = (sub) => joinUrl(API_BASE, ['repos', p.owner, p.repo, ...(sub ? sub.split('/') : [])]);

    switch (parsed.resourceType) {
      case 'user':
        return [
          item(`Repositories of ${p.login}`, users('repos'), `${DOCS}/repos/repos#list-public-repositories-for-a-user`, 'repos'),
          item(`Followers of ${p.login}`, users('followers'), `${DOCS}/users/followers#list-followers-of-a-user`, 'followers'),
          item(`Followed by ${p.login}`, users('following'), `${DOCS}/users/followers#list-the-people-a-user-follows`, 'following'),
          item(`Gists of ${p.login}`, users('gists'), `${DOCS}/gists/gists#list-gists-for-a-user`, 'gists'),
          item(`Organizations of ${p.login}`, users('orgs'), `${DOCS}/orgs/orgs#list-organizations-for-a-user`, 'orgs'),
          item(`Public events of ${p.login}`, users('events'), `${DOCS}/activity/events`, 'events'),
          item(`Events received by ${p.login}`, users('received_events'), `${DOCS}/activity/events#list-events-received-by-the-authenticated-user`, 'received_events'),
          item(`Starred by ${p.login}`, users('starred'), `${DOCS}/activity/starring#list-repositories-starred-by-a-user`, 'starred'),
        ];
      case 'org':
        return [
          item(`Repositories of ${p.org}`, joinUrl(API_BASE, ['orgs', p.org, 'repos']), `${DOCS}/repos/repos#list-organization-repositories`, 'repos'),
          item(`Members of ${p.org}`, joinUrl(API_BASE, ['orgs', p.org, 'members']), `${DOCS}/orgs/members#list-organization-members`, 'members'),
          item(`Events of ${p.org}`, joinUrl(API_BASE, ['orgs', p.org, 'events']), `${DOCS}/activity/events#list-public-organization-events`, 'events'),
        ];
      case 'repo':
        return [
          item('Issues', repos('issues'), DOCS_BY_RESOURCE.issues, 'issues'),
          item('Pull requests', repos('pulls'), DOCS_BY_RESOURCE.pulls, 'pulls'),
          item('Commits', repos('commits'), DOCS_BY_RESOURCE.commits, 'commits'),
          item('Releases', repos('releases'), DOCS_BY_RESOURCE.releases, 'releases'),
          item('Branches', repos('branches'), DOCS_BY_RESOURCE.branches, 'branches'),
          item('Tags', repos('tags'), DOCS_BY_RESOURCE.tags, 'tags'),
          item('Root contents', repos('contents'), DOCS_BY_RESOURCE.contents, 'contents'),
          item('Contributors', repos('contributors'), `${DOCS}/repos/repos#list-repository-contributors`, 'contributors'),
          item('Languages', repos('languages'), `${DOCS}/repos/repos#list-repository-languages`, 'languages'),
          item('Forks', repos('forks'), `${DOCS}/repos/forks#list-forks`, 'forks'),
        ];
      case 'issue':
        return [
          item(`Comments on #${p.number}`, repos(`issues/${p.number}/comments`), `${DOCS}/issues/comments#list-issue-comments`, 'comments'),
          item(`Labels on #${p.number}`, repos(`issues/${p.number}/labels`), `${DOCS}/issues/labels#list-labels-for-an-issue`, 'labels'),
        ];
      case 'pull':
        return [
          item(`Commits in #${p.number}`, repos(`pulls/${p.number}/commits`), `${DOCS}/pulls/pulls#list-commits-on-a-pull-request`, 'commits'),
          item(`Files in #${p.number}`, repos(`pulls/${p.number}/files`), `${DOCS}/pulls/pulls#list-pull-requests-files`, 'files'),
          item(`Reviews on #${p.number}`, repos(`pulls/${p.number}/reviews`), `${DOCS}/pulls/reviews#list-reviews-for-a-pull-request`, 'reviews'),
        ];
      default:
        return [];
    }
  },

  describe(parsed) {
    const p = parsed.params;
    switch (parsed.resourceType) {
      case 'user': return `GitHub user "${p.login}"`;
      case 'org': return `GitHub organization "${p.org}"`;
      case 'repo': return `GitHub repository ${p.owner}/${p.repo}`;
      case 'issue': return `issue ${p.owner}/${p.repo}#${p.number}`;
      case 'pull': return `pull request ${p.owner}/${p.repo}#${p.number}`;
      case 'commit': return `commit ${p.sha.slice(0, 10)} of ${p.owner}/${p.repo}`;
      default: return `${parsed.resourceType} of ${p.owner ? `${p.owner}/${p.repo}` : p.login ?? ''}`;
    }
  },
};

function mk(resourceType, params, originalUrl) {
  return { providerId: 'github', resourceType, params, originalUrl };
}
