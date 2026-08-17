/**
 * GitLab provider adapter (REST API v4).
 *
 * GitLab deliberately does NOT map 1:1 from website URLs to API URLs:
 *   - users are looked up by query parameter:  /api/v4/users?username={login}
 *   - projects are addressed by URL-encoded full path: /api/v4/projects/{url-encoded-path}
 *   - website project sub-resources live under a "/-/" separator
 *   - the API version is part of the base path (/api/v4), not a header
 * This adapter owns all of those rules. Docs: https://docs.gitlab.com/api/rest/
 */

import { ResolverError, ResolverErrorCode } from '../core/errors.js';
import { joinUrl, encodeFully, encodePathKeepingSlashes } from '../core/url.js';

const DOCS = 'https://docs.gitlab.com/api/rest/';
const DEFAULT_API_SUFFIX = '/api/v4';

/** gitlab.com top-level paths that are not users/groups/projects. */
const RESERVED = new Set([
  'explore', 'help', 'admin', 'dashboard', 'search', 'users', 'groups', 'projects',
  'api', '-', 'snippets', 'preferences', 'profile', 'activity', 'issues',
  'merge_requests', 'todos', 'milestones', 'labels', 'boards', 'playground',
]);

function requireNumber(value, what, url) {
  if (!/^\d+$/.test(String(value))) {
    throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `GitLab ${what} ids must be numeric, got "${value}".`, [
      `Check the original URL: ${url}`,
    ]);
  }
  return value;
}

export const gitlab = {
  id: 'gitlab',
  name: 'GitLab',
  family: 'gitlab',
  docsUrl: DOCS,
  defaultWebBase: 'https://gitlab.com',
  defaultApiBase: `https://gitlab.com${DEFAULT_API_SUFFIX}`,
  apiSuffixDefault: DEFAULT_API_SUFFIX,
  apiInfo: {
    versionLabel: 'REST API v4 (version is part of the base path /api/v4, not a request header)',
    mediaType: 'application/json',
    notes: ['Requests send Accept: application/json.'],
  },
  requestHeaders: { Accept: 'application/json' },
  capabilities: {
    selfHosted: true,
    resources: [
      { type: 'user', label: 'User', webPattern: '/{username}', apiPattern: '/users?username={username}' },
      { type: 'project', label: 'Project (incl. nested groups)', webPattern: '/{group}[/{subgroup}...]/{project}', apiPattern: '/projects/{url-encoded-full-path}' },
      { type: 'issue', label: 'Issue', webPattern: '/{path}/-/issues/{iid}', apiPattern: '/projects/{id}/issues/{iid}' },
      { type: 'mr', label: 'Merge request', webPattern: '/{path}/-/merge_requests/{iid}', apiPattern: '/projects/{id}/merge_requests/{iid}' },
      { type: 'commit', label: 'Commit', webPattern: '/{path}/-/commit/{sha}', apiPattern: '/projects/{id}/repository/commits/{sha}' },
      { type: 'commits', label: 'Commit list', webPattern: '/{path}/-/commits', apiPattern: '/projects/{id}/repository/commits' },
      { type: 'releases', label: 'Releases', webPattern: '/{path}/-/releases', apiPattern: '/projects/{id}/releases' },
      { type: 'release-by-tag', label: 'Release by tag', webPattern: '/{path}/-/releases/{tag}', apiPattern: '/projects/{id}/releases/{url-encoded-tag}' },
      { type: 'branches', label: 'Branch list', webPattern: '/{path}/-/branches', apiPattern: '/projects/{id}/repository/branches' },
      { type: 'branch', label: 'Branch', webPattern: '/{path}/-/tree/{branch}', apiPattern: '/projects/{id}/repository/branches/{url-encoded-branch}' },
      { type: 'tags', label: 'Tag list', webPattern: '/{path}/-/tags', apiPattern: '/projects/{id}/repository/tags' },
      { type: 'file', label: 'File', webPattern: '/{path}/-/blob/{ref}/{file}', apiPattern: '/projects/{id}/repository/files/{url-encoded-file}?ref={ref}' },
    ],
    limitations: [
      'Users resolve to /users?username= and the response is a JSON array (possibly empty) rather than a single object.',
      'Related resources for a single user cannot be built without the numeric user id; inspect the lookup response first.',
      'tree/blob URLs mix ref and path; the first segment after blob is treated as the ref (heuristic).',
      'Self-hosted instances must be registered under Providers before their URLs resolve.',
    ],
  },

  match(url) {
    return url.hostname === 'gitlab.com';
  },

  /** @param {URL} url */
  parse(url) {
    const original = url.toString();
    let segs = url.pathname.split('/').filter(Boolean);
    if (segs.length > 0) segs[segs.length - 1] = segs[segs.length - 1].replace(/\.git$/, '');
    if (segs.length === 0) {
      throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, 'The GitLab homepage does not map to a single API resource.', [
        'Provide a user or project URL, e.g. https://gitlab.com/gitlab-org/gitlab',
      ]);
    }

    const sepIndex = segs.indexOf('-');
    const projectSegs = sepIndex === -1 ? segs : segs.slice(0, sepIndex);
    const sub = sepIndex === -1 ? [] : segs.slice(sepIndex + 1);

    if (sepIndex === -1) {
      if (segs.length === 1) {
        const username = segs[0];
        if (RESERVED.has(username.toLowerCase())) {
          throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `"gitlab.com/${username}" is a GitLab site page, not an API resource.`);
        }
        return mk('user', { username }, original);
      }
      if (RESERVED.has(segs[0].toLowerCase())) {
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `"gitlab.com/${segs[0]}/…" is not a project path.`);
      }
      return mk('project', { fullPath: segs.join('/') }, original);
    }

    if (projectSegs.length === 0) {
      throw new ResolverError(ResolverErrorCode.MALFORMED_URL, 'GitLab sub-resource URL is missing its project path before "/-/".');
    }
    const fullPath = projectSegs.join('/');

    const [kind, ...rest] = sub;
    switch (kind) {
      case 'issues':
        return mk('issue', { fullPath, iid: requireNumber(rest[0], 'issue', original) }, original);
      case 'merge_requests':
        return mk('mr', { fullPath, iid: requireNumber(rest[0], 'merge request', original) }, original);
      case 'commit':
        return mk('commit', { fullPath, sha: rest[0] }, original);
      case 'commits':
        return mk('commits', { fullPath, ref: rest.join('/') || undefined }, original);
      case 'releases':
        if (rest.length === 0) return mk('releases', { fullPath }, original);
        return mk('release-by-tag', { fullPath, tag: rest.join('/') }, original);
      case 'tags':
        return mk('tags', { fullPath }, original);
      case 'branches':
        return mk('branches', { fullPath }, original);
      case 'tree':
        if (rest.length === 1) return mk('branch', { fullPath, branch: rest[0] }, original);
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, 'GitLab tree URLs mix a branch name and a directory path, which cannot be split unambiguously without git data.');
      case 'blob': {
        if (rest.length < 2) throw new ResolverError(ResolverErrorCode.MISSING_INFO, 'Blob URLs need a ref and a file path, e.g. /-/blob/main/README.md');
        return mk('file', { fullPath, ref: rest[0], path: rest.slice(1).join('/') }, original);
      }
      default:
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `GitLab path "/-/${kind}" has no API mapping in GitAPITaker yet.`, [
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
      providerId: 'gitlab',
      method: 'GET',
      parsed,
      headers: { Accept: 'application/json' },
      apiBase: api,
      instanceId: ctx.instanceId,
      notes: [],
    };
    const project = () => joinUrl(api, ['projects', encodeFully(p.fullPath)]);

    switch (parsed.resourceType) {
      case 'user':
        return {
          ...common, resourceType: 'user',
          url: `${joinUrl(api, ['users'])}?username=${encodeURIComponent(p.username)}`,
          docUrl: `${DOCS}users/`,
          label: `GitLab user lookup: ${p.username}`,
          notes: ['GitLab resolves users by query parameter; the response is a JSON array and may be empty if the username does not exist.'],
        };
      case 'project':
        return { ...common, resourceType: 'project', url: project(), docUrl: `${DOCS}projects/`, label: `GitLab project ${p.fullPath}` };
      case 'issue':
        return { ...common, resourceType: 'issue', url: joinUrl(project(), ['issues', p.iid]), docUrl: `${DOCS}issues/`, label: `Issue #${p.iid} of ${p.fullPath}` };
      case 'mr':
        return { ...common, resourceType: 'mr', url: joinUrl(project(), ['merge_requests', p.iid]), docUrl: `${DOCS}merge_requests/`, label: `MR !${p.iid} of ${p.fullPath}` };
      case 'commit':
        return { ...common, resourceType: 'commit', url: joinUrl(project(), ['repository', 'commits', p.sha]), docUrl: `${DOCS}commits/`, label: `Commit ${p.sha.slice(0, 10)}` };
      case 'commits': {
        let url = joinUrl(project(), ['repository', 'commits']);
        if (p.ref) url += `?ref_name=${encodeURIComponent(p.ref)}`;
        return { ...common, resourceType: 'commits', url, docUrl: `${DOCS}commits/`, label: `Commits of ${p.fullPath}` };
      }
      case 'releases':
        return { ...common, resourceType: 'releases', url: joinUrl(project(), ['releases']), docUrl: `${DOCS}releases/`, label: `Releases of ${p.fullPath}` };
      case 'release-by-tag':
        return { ...common, resourceType: 'release-by-tag', url: joinUrl(project(), ['releases', encodeFully(p.tag)]), docUrl: `${DOCS}releases/`, label: `Release ${p.tag}` };
      case 'branches':
        return { ...common, resourceType: 'branches', url: joinUrl(project(), ['repository', 'branches']), docUrl: `${DOCS}branches/`, label: `Branches of ${p.fullPath}` };
      case 'branch':
        return { ...common, resourceType: 'branch', url: joinUrl(project(), ['repository', 'branches', encodeFully(p.branch)]), docUrl: `${DOCS}branches/`, label: `Branch ${p.branch}` };
      case 'tags':
        return { ...common, resourceType: 'tags', url: joinUrl(project(), ['repository', 'tags']), docUrl: `${DOCS}tags/`, label: `Tags of ${p.fullPath}` };
      case 'file': {
        const url = new URL(joinUrl(project(), ['repository', 'files', encodeFully(p.path)]));
        url.searchParams.set('ref', p.ref);
        return {
          ...common, resourceType: 'file', url: url.toString(), docUrl: `${DOCS}repository_files/`, label: `File ${p.path}`,
          notes: ['blob URLs mix ref and path; the first path segment after /blob was taken as the ref.'],
        };
      }
      default:
        throw new ResolverError(ResolverErrorCode.UNSUPPORTED_RESOURCE, `GitLab resource type "${parsed.resourceType}" cannot be resolved.`);
    }
  },

  /** @param {import('../core/types.js').ParsedResource} parsed @param {{apiBase: string}} ctx */
  related(parsed, ctx) {
    const api = ctx.apiBase.replace(/\/+$/, '');
    const p = parsed.params;
    const item = (label, url, docUrl, resourceType) => ({ label, url, docUrl, resourceType });
    const project = () => joinUrl(api, ['projects', encodeFully(p.fullPath)]);

    if (parsed.resourceType === 'user') {
      // Without the numeric user id we cannot build /users/:id/projects etc.
      // This is an honest capability limitation, surfaced in the UI.
      return [];
    }
    if (['project', 'issue', 'mr', 'commit', 'commits', 'releases', 'release-by-tag', 'branches', 'branch', 'tags', 'file'].includes(parsed.resourceType)) {
      return [
        item('Issues', joinUrl(project(), ['issues']), `${DOCS}issues/`, 'issues'),
        item('Merge requests', joinUrl(project(), ['merge_requests']), `${DOCS}merge_requests/`, 'merge_requests'),
        item('Commits', joinUrl(project(), ['repository', 'commits']), `${DOCS}commits/`, 'commits'),
        item('Releases', joinUrl(project(), ['releases']), `${DOCS}releases/`, 'releases'),
        item('Branches', joinUrl(project(), ['repository', 'branches']), `${DOCS}branches/`, 'branches'),
        item('Tags', joinUrl(project(), ['repository', 'tags']), `${DOCS}tags/`, 'tags'),
        item('Contributors', joinUrl(project(), ['repository', 'contributors']), `${DOCS}repositories/`, 'contributors'),
        item('Members (incl. inherited)', joinUrl(project(), ['members', 'all']), `${DOCS}members/`, 'members'),
      ];
    }
    return [];
  },

  describe(parsed) {
    const p = parsed.params;
    switch (parsed.resourceType) {
      case 'user': return `GitLab user lookup "${p.username}"`;
      case 'project': return `GitLab project ${p.fullPath}`;
      case 'issue': return `issue ${p.fullPath}#${p.iid}`;
      case 'mr': return `merge request ${p.fullPath}!${p.iid}`;
      case 'commit': return `commit ${p.sha.slice(0, 10)} of ${p.fullPath}`;
      default: return `${parsed.resourceType} of ${p.fullPath ?? ''}`;
    }
  },
};

function mk(resourceType, params, originalUrl) {
  return { providerId: 'gitlab', resourceType, params, originalUrl };
}
