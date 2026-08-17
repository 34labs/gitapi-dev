# GitAPITaker

**Take a Git hosting URL. Inspect the API behind it.**

GitAPITaker is a privacy-first, keyboard-driven developer tool that resolves Git hosting URLs
(`https://github.com/flessan`) into their provider REST API endpoints (`https://api.github.com/users/flessan`),
performs the request **directly from your browser**, and shows you everything about the exchange —
with an honest LIVE / CACHED / STALE state on every response.

It is a **static frontend application**. There is no backend, no API proxy, no relay, no telemetry,
no analytics and no application-owned database. It deploys to GitHub Pages as-is.

```
input URL → provider detection → URL parser → resource identification
         → provider resolver → API endpoint builder → request layer
         → response inspector
```

Every stage is an independent, testable module — and in v0.2 the UI shows them to you literally:
the **resolution pipeline** (`DETECT → PARSE → RESOLVE → FETCH`) renders the actual outcome of each
stage for every inspection, including which stage failed and why.

## What's new in v0.2 (UI/UX redesign + new features)

**Redesign — “lab instrument” identity.** A terminal-style command strip with prompt glyph, a
two-pane inspector (metadata rail + response area), box-drawn section headings, mono-forward
type, amber-on-charcoal palette (light theme supported), precise focus states, zero emoji,
zero web fonts. The theme toggle (or <kbd>t</kbd) cycles auto/dark/light and persists locally.

**Resolution pipeline tracker.** Every inspection renders its stages with real values:
`detect: github.com → github · parse: user · login=flessan · resolve: GET api.github.com/users/flessan · fetch: LIVE 200 · 312 ms · 4.2 KB`.
Failures mark the exact stage that broke; suppressed requests show the cache path instead of a
fake fetch.

**New features:**

- **Pagination navigation** — GitAPITaker reads GitHub/Gitea `Link` headers and GitLab
  `x-page/x-next-page/x-total` headers and offers honest Prev/Next page buttons (only what the
  provider actually reported, never invented counts).
- **JSON search & copy** — filter keys/values with auto-expanding highlights and a match counter;
  click any key to copy its JSONPath (`$.nested.tags[0]`), click any value to copy it.
- **Actionable interpretations** — e.g. a GitHub user 404 offers a one-click *“Try as
  organization”* button; an unknown host offers a jump to instance registration.
- **Change detection** — when a forced refresh replaces a cached response, GitAPITaker diffs the
  two bodies and shows “changed since previous capture — N differences” with a jump to the diff.
- **Metadata rail** — status, provider, duration/age, size, fetch time, source and the Request
  Guard module in one glance, with Refresh/Diff/Share/cURL actions.
- **Theme persistence** — auto/dark/light, stored locally like everything else.

---

## Supported providers

| Provider | Web host(s) | API base | Notes |
| --- | --- | --- | --- |
| GitHub | `github.com` | `https://api.github.com` | `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28` |
| GitLab | `gitlab.com` | `https://gitlab.com/api/v4` | Version lives in the path, not a header |
| Gitea | `gitea.com` | `https://gitea.com/api/v1` | Also powers Forgejo instances |
| Self-hosted Gitea/Forgejo/GitLab | any host you register | `{host}/api/v1` or `/api/v4` (override allowed) | Register under **Providers → Custom instances** |

### Resource mappings

The mappings are owned by each provider adapter; they are *not* one-to-one URL rewrites.

**GitHub** — `/users/{login}`, `/orgs/{org}`, `/repos/{o}/{r}`, `/repos/{o}/{r}/issues/{n}`,
`/repos/{o}/{r}/pulls/{n}` (from web `/pull/{n}`), `/repos/{o}/{r}/commits[/{sha}]`,
`/repos/{o}/{r}/releases`, `/releases/tags/{tag}`, `/releases/latest`, `/branches[/{branch}]`,
`/tags`, `/contents/{path}?ref={ref}`.

**GitLab** — users resolve to `GET /users?username={login}` (response is an array), projects to
`GET /projects/{url-encoded-full-path}` (nested groups supported), plus `/projects/{id}/issues/{iid}`,
`/merge_requests/{iid}`, `/repository/commits/{sha}`, `/releases/{url-encoded-tag}`,
`/repository/branches/{branch}`, `/repository/tags`, `/repository/files/{path}?ref={ref}`.
Website sub-resources live under the `/-/` separator; the adapter handles that.

**Gitea** — `/users/{name}`, `/repos/{o}/{r}`, `/repos/{o}/{r}/issues/{n}`, `/pulls/{n}`,
`/git/commits/{sha}`, `/commits`, `/releases`, `/releases/tags/{tag}` (plural route, verified
against Gitea's router), `/releases/latest`, `/branches[/{branch}]`, `/tags`,
`/contents/{path}?ref={ref}`.

Shorthand input is accepted: `github.com/flessan`, `gitlab.com/group/project`,
even `git@github.com:owner/repo.git`.

---

## Architecture

```
index.html              app shell (semantic landmarks, dialogs, live regions)
styles/app.css          restrained technical styling (dark default, light via media query)
src/
  app.js                orchestration only — wires core to UI
  core/
    types.js            explicit data shapes (ParsedResource, ResolvedEndpoint,
                        ResponseRecord, CacheEntry, GuardDecision, ...)
    url.js              input normalization (full URLs, shorthand, ssh remotes)
    errors.js           error model: resolver vs provider vs network errors + interpretations
    resolver.js         pipeline: normalize → detect → parse → resolve
    request.js          direct fetch layer (injectable, testable, credentials: omit)
    cache.js            localStorage cache, keys, freshness, snapshot ring for diff
    guard.js            Request Guard (cooldown suppression, transparent counters)
    history.js          local inspection history (metadata only)
    share.js            shareable inspection URLs (instruction only, never response data)
    curl.js             Copy-as-cURL builder
    diff.js             structural JSON diff (pure, non-mutating)
    pagination.js       provider-aware pagination signals (Link / x-* headers)
    jsonsearch.js       pure JSON key/value matching with JSONPath results
    storage.js          localStorage wrapper with in-memory fallback
    format.js           bytes/duration/time formatting
  providers/
    registry.js         provider detection (separate from parsing and resolution)
    github.js           GitHub adapter: match / parse / resolve / related / describe
    gitlab.js           GitLab adapter
    gitea.js            Gitea adapter (also used for Forgejo instances)
    instances.js        self-hosted instance registry + honest reachability probing
  viewer/
    json.js raw.js headers.js request.js    the four inspector views
  ui/
    inspector.js explorer.js history-view.js cache-view.js providers-view.js
    community.js palette.js help.js tabs.js router.js keyboard.js announce.js
    theme.js dom.js
  community/config.js   Giscus configuration (GitHub Discussions backend)
tests/                  node:test suite (167 tests incl. a DOM boot test, mocked fetch)
tools/serve.mjs         dependency-free dev server
.github/workflows/pages.yml   CI (tests on Node 20/22) + GitHub Pages deploy
```

Separation rules the codebase enforces:

- **Provider knowledge lives only in provider adapters.** Core and UI never hardcode endpoints.
- **Detection ≠ parsing ≠ resolution.** `registry.detectProvider()` picks the adapter; the
  adapter's `parse()` produces a `ParsedResource`; `resolve()` produces a `ResolvedEndpoint`.
- **Cache and Request Guard are DOM-free** and independently testable.
- **The request layer never fabricates data.** Only values observed from `fetch()` are recorded.

---

## Security & privacy model

- **Direct requests.** Every API call goes from your browser straight to the provider.
  GitAPITaker operates no proxy, relay or server of any kind.
- **No telemetry.** No analytics, tracking pixels, behavioral tracking or request logging.
  The only third-party requests are (a) the provider API you ask to inspect and
  (b) the Giscus widget on the Community page, which talks to GitHub.
- **Local-only state.** Cache, history, instances, theme and settings live in `localStorage` and are
  never transmitted. Clear them any time from the Cache/History pages.
- **No credentials.** v0.1 performs unauthenticated requests with `credentials: "omit"`.
  Tokens are never placed in URLs, query strings, share links, history or cache records.
  If authentication is added later, memory-only defaults and explicit warnings come first.
- **Honest network state.** Responses are always labeled **LIVE**, **CACHED** or **STALE**
  (text labels, not color alone). A cached `200 OK` is never presented as fresh.
- **Provider limits still apply.** The provider receives your request; its rate limits,
  terms and policies govern it. See below for what the Request Guard is — and is not.

## Caching

Responses are cached in `localStorage` as structured records: provider, method, endpoint, status,
status text, headers, exact raw body, request headers, size, fetch timestamp and TTL (5 minutes).
Keys are `gitapitaker.cache.v1.{provider}:{method}:{hash(provider|method|endpoint)}` — full
request context, so unrelated requests never collide.

- **FRESH** entries (age ≤ TTL) are what the Request Guard serves for repeated requests.
- **STALE** entries remain inspectable (offline mode: JSON/RAW/HEADERS/REQUEST all work from
  the record) but are always labeled stale with the original fetch time.
- When a live response replaces an existing entry, the previous one is archived into a snapshot
  ring (max 5 per endpoint) — that is what **Response Diff** compares. Older and newer are
  labeled by fetch timestamp; originals are never modified.

## Request Guard

After a live request, identical requests within a 10-second cooldown are **suppressed and served
from cache**. This is explicit in the UI: a note states that the request was suppressed, how many
repeats were suppressed this session, and when a live request is allowed again. `r` (or the
Refresh button) forces a live request.

The guard is a local safety mechanism to keep the UI responsive and protect third-party APIs from
accidental hammering. **It is not designed to bypass provider rate limits.** GitAPITaker never
rotates identities, proxies requests, or circumvents provider protections; rate limits apply to
every live request.

## Shareable inspection URLs

`…/#/inspect?u=https%3A%2F%2Fgithub.com%2Fflessan` encodes only the instruction *inspect this
resource* — never the response, tokens or cache. Opening one performs a normal inspection with the
usual guard/cache rules. A top-level `?u=` query is also accepted.

---

## Local development

No dependencies, no build step. Requires Node ≥ 20 for tests.

```sh
npm ci                    # dev dependencies only (happy-dom for the DOM boot test)
node tools/serve.mjs      # serve the app at http://localhost:8080 (PORT env to change)
npm test                  # run the node:test suite (167 tests, all mocked)
```

## Keyboard reference

`Ctrl/Cmd+K` palette · `/` focus input · `Enter` inspect · `1–4` JSON/RAW/HEADERS/REQUEST ·
`r` force live request · `y` copy cURL · `s` share link · `d` diff · `t` cycle theme ·
`?` help · `Esc` close. In the JSON view, the filter box searches keys/values (matches
auto-expand), clicking a key copies its JSONPath, clicking a value copies the value.

## GitHub Pages deployment

The repository root *is* the site — no build step is invented. The workflow
`.github/workflows/pages.yml` runs the test suite (Node 20 + 22) and, on pushes to `main`,
uploads the static tree and deploys via `actions/deploy-pages`. The app uses **hash routing and
relative asset paths**, so it works at repository subpaths (`https://user.github.io/repo/`)
without extra configuration. `.nojekyll` (included) makes Pages serve files verbatim.

> **Setup note:** the workflow file is written and present at `.github/workflows/pages.yml`,
> but the automation that authored this repository did not have the GitHub `workflows`
> permission, so the file could not be pushed. A maintainer with workflow permissions should
> `git add -f .github/workflows/pages.yml`, commit it, and remove the matching lines from
> `.gitignore`. Until then, enable Pages with “Deploy from a branch” on `main` (whole
> repository, root) for an equivalent static deploy.

## Community

Community discussions run on **GitHub Discussions via Giscus** — no custom forum backend.
One-time setup (repository owner): enable Discussions, install the Giscus app, then fill
`repoId`/`categoryId` in `src/community/config.js` (instructions are in that file). Provider
cards link to contextual “discuss this provider” discussion templates.

---

## Adding a provider

Contributors add a provider by writing one adapter module — no core changes.

1. Create `src/providers/forgejo.js` (or `bitbucket.js`, …) exporting an object with:
   - `id`, `name`, `docsUrl`, `defaultWebBase`, `defaultApiBase`
   - `requestHeaders` — headers GitAPITaker sets on requests for this provider
   - `apiInfo` — version/media-type facts shown in the REQUEST view
   - `capabilities.resources` — the table shown on the Providers page (metadata, not UI code)
   - `match(url)` — built-in host matching (self-hosted kinds set `capabilities.selfHosted`)
   - `parse(url, ctx)` — pure function returning a `ParsedResource`; throw `ResolverError`
     with actionable hints for anything unsupported
   - `resolve(parsed, ctx)` — pure function returning a `ResolvedEndpoint`
     (`{providerId, method, url, headers, docUrl, label, notes}`)
   - `related(parsed, ctx)` — endpoint-explorer items derived from capability metadata
   - `describe(parsed)` — one-line human label
2. Register it in `src/providers/registry.js` (`registerProvider(forgejo)`).
3. Add tests: detection, parsing, resolution, edge cases, related resources.

Notes for likely candidates:

- **Forgejo** already works today through the Gitea adapter when registered as a custom instance
  (`kind: 'gitea'`); a dedicated adapter would only add Forgejo-specific routes.
- **Bitbucket Cloud** needs its own adapter: `api.bitbucket.org/2.0` uses workspace/repository
  slugs and paginated collection endpoints that differ structurally from the current providers —
  a good test case for the adapter contract.
- If a provider cannot serve browsers cross-origin, document that in `capabilities.limitations`;
  GitAPITaker reports CORS failures honestly instead of proxying around them.

## Contributing

1. Run `npm test`; keep the suite green and add tests for new mapping rules.
2. Keep provider knowledge inside adapters; keep core and UI provider-agnostic.
3. Never fabricate request/response data, never add tracking, never add a build step without a
   very strong reason.
4. Open a PR describing the mapping rules you added and any provider quirks you discovered.

## Known limitations

- `github.com/{name}` is ambiguous (user vs org); users endpoint is tried first and the 404
  interpretation suggests `/orgs/{name}`.
- GitLab user lookup returns an array; related-user endpoints need the numeric id from it.
- `tree`/`blob` URLs mix ref and path; the first segment after the marker is treated as the ref
  (heuristic, labeled in the REQUEST view).
- Browsers expose only CORS-allowed response headers; the HEADERS view states this explicitly.
- Self-hosted instances without CORS enabled cannot be called from any browser app.
- GET requests only.

## License

MIT
