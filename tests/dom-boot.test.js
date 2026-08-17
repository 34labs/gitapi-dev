/**
 * DOM boot test (happy-dom, dev-only): loads the real index.html, imports
 * the real app.js and drives an inspection session end-to-end with a
 * mocked fetch. No live provider API is contacted.
 *
 * app.js boots once per process, so scenarios run sequentially like one
 * user session.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createFetchMock } from './helpers/mock-fetch.js';
import { loadFixture } from './helpers/fixtures.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const window = new Window({ url: 'https://user.github.io/gitapi-dev/' });
globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.HTMLElement = window.HTMLElement;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

document.documentElement.innerHTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/^[\s\S]*?<html[^>]*>/i, '')
  .replace(/<\/html>[\s\S]*$/i, '');

const fetchMock = createFetchMock((url) => {
  if (String(url).includes('api.github.com/users/flessan')) {
    return {
      status: 200, statusText: 'OK',
      headers: { 'content-type': 'application/json; charset=utf-8', etag: 'W/"fixture"' },
      body: loadFixture('github-user.json'),
    };
  }
  return { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' }, body: loadFixture('github-404.json') };
});
globalThis.fetch = fetchMock;

const submitForm = () => {
  document.getElementById('inspect-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

test('boot: app renders the empty state on first load', async () => {
  await import('../src/app.js');
  await sleep(60);
  assert.equal(document.getElementById('empty-state').hidden, false);
  assert.equal(document.getElementById('result-area').hidden, true);
  assert.equal(document.getElementById('pipeline').hidden, true, 'pipeline hidden before any inspection');
  assert.equal(fetchMock.calls.length, 0, 'no request happens before the user acts');
});

test('inspect: GitHub user URL renders pipeline, LIVE rail and all four tabs', async () => {
  document.getElementById('url-input').value = 'https://github.com/flessan';
  submitForm();
  await sleep(120);

  assert.equal(fetchMock.calls.length, 1, 'exactly one direct provider request');
  assert.ok(fetchMock.calls[0].url.startsWith('https://api.github.com/users/flessan'));
  assert.equal(fetchMock.calls[0].init.credentials, 'omit', 'credentials never sent');

  // Pipeline shows every stage with real values.
  const pipeline = document.getElementById('pipeline');
  assert.equal(pipeline.hidden, false);
  const pipeText = pipeline.textContent;
  assert.ok(pipeText.includes('detect'), `pipeline has detect stage: ${pipeText}`);
  assert.ok(pipeText.includes('github.com → github'), 'detect stage names host and adapter');
  assert.ok(pipeText.includes('user'), 'parse stage names the resource type');
  assert.ok(pipeText.includes('api.github.com/users/flessan'), 'resolve stage shows the endpoint');
  assert.ok(pipeText.includes('LIVE 200'), 'fetch stage reports live status');

  // Metadata rail carries the honest state.
  const rail = document.getElementById('status-bar').textContent;
  assert.ok(rail.includes('LIVE'), `LIVE badge shown: ${rail}`);
  assert.ok(rail.includes('200'), 'status 200 shown');

  assert.equal(document.getElementById('result-area').hidden, false);
  for (const id of ['tab-json', 'tab-raw', 'tab-headers', 'tab-request']) {
    assert.ok(document.getElementById(id), `${id} exists`);
  }

  assert.ok(document.getElementById('panel-json').textContent.includes('"flessan"'), 'JSON view renders login');

  document.getElementById('tab-raw').click();
  await sleep(20);
  assert.ok(document.getElementById('panel-raw').textContent.includes('"public_repos": 4'), 'RAW view shows body');

  document.getElementById('tab-headers').click();
  await sleep(20);
  assert.ok(document.getElementById('panel-headers').textContent.toLowerCase().includes('etag'), 'HEADERS view lists etag');

  document.getElementById('tab-request').click();
  await sleep(20);
  const requestText = document.getElementById('panel-request').textContent;
  assert.ok(requestText.includes('GET'));
  assert.ok(requestText.includes('X-GitHub-Api-Version: 2022-11-28'));
  assert.ok(requestText.toLowerCase().includes('curl'), 'cURL command present');
  assert.ok(requestText.includes('no proxy'), 'direct-request honesty note present');

  // Endpoint explorer is driven by adapter metadata.
  const explorer = document.getElementById('explorer-area');
  assert.equal(explorer.hidden, false, 'explorer visible for a user resource');
  assert.ok(explorer.textContent.includes('Repositories of flessan'));

  // Single-object response has no pagination.
  assert.equal(document.getElementById('pagination-bar').hidden, true);
});

test('JSON view: search filters and reports matches', async () => {
  document.getElementById('tab-json').click();
  await sleep(20);
  const search = document.querySelector('.json-search');
  assert.ok(search, 'JSON search input exists');
  search.value = 'public_repos';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300); // debounce
  const info = document.querySelector('.json-match-info').textContent;
  assert.ok(/1 match/.test(info), `expected 1 match, got: ${info}`);
  const hit = document.querySelector('.j-hit, .json-leaf-hit');
  assert.ok(hit, 'a match is highlighted');
  search.value = '';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
});

test('cache + history: records are stored locally', async () => {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i));
  assert.ok(keys.some((k) => k.startsWith('gitapitaker.cache.v1.')), `cache stored (${keys.join(', ')})`);
  assert.ok(keys.some((k) => k.startsWith('gitapitaker.history.v1')), 'history stored');

  const history = JSON.parse(window.localStorage.getItem('gitapitaker.history.v1'));
  assert.equal(history.length, 1);
  assert.equal(history[0].endpoint, 'https://api.github.com/users/flessan');
  assert.equal(history[0].stateLabel, 'LIVE');
  assert.ok(!JSON.stringify(history).includes('bodyText'), 'history never stores bodies');
});

test('guard: an immediate repeat is suppressed and labeled CACHED, not LIVE', async () => {
  submitForm();
  await sleep(120);
  assert.equal(fetchMock.calls.length, 1, 'second request suppressed by the Request Guard');

  const rail = document.getElementById('status-bar').textContent;
  assert.ok(rail.includes('CACHED'), `CACHED badge shown: ${rail}`);
  const guardNote = document.getElementById('guard-note');
  assert.equal(guardNote.hidden, false, 'guard note visible');
  assert.ok(guardNote.textContent.includes('Request Guard'));
  assert.ok(guardNote.textContent.includes('suppressed'));
});

test('keyboard: number keys switch response tabs', async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
  await sleep(20);
  assert.equal(document.getElementById('tab-json').getAttribute('aria-selected'), 'true');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
  await sleep(20);
  assert.equal(document.getElementById('tab-headers').getAttribute('aria-selected'), 'true');
  assert.equal(document.getElementById('panel-headers').hidden, false);
});

test('theme: toggle cycles auto -> dark -> light and persists', async () => {
  const btn = document.getElementById('theme-toggle');
  assert.ok(btn, 'theme toggle exists');
  btn.click();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  btn.click();
  assert.equal(document.documentElement.dataset.theme, 'light');
  btn.click();
  assert.equal(document.documentElement.dataset.theme, undefined, 'auto removes the override');
  assert.equal(window.localStorage.getItem('gitapitaker.theme.v1'), '"auto"');
});

test('resolver: unsupported host shows staged failure and sends nothing', async () => {
  document.getElementById('url-input').value = 'https://unknown.example.com/some/repo';
  submitForm();
  await sleep(60);

  const box = document.getElementById('resolver-error');
  assert.equal(box.hidden, false);
  assert.ok(box.textContent.includes('unsupported-provider'));
  assert.ok(box.textContent.includes('stage: detect'), 'failure names the failed pipeline stage');
  assert.ok(box.textContent.includes('No request was sent'));
  assert.ok(box.textContent.includes('Register a self-hosted instance'), 'quick action offered');
  assert.equal(document.getElementById('result-area').hidden, true);
  assert.equal(fetchMock.calls.length, 1, 'still only the one earlier live request');

  const pipeText = document.getElementById('pipeline').textContent;
  assert.ok(pipeText.includes('no adapter'), 'pipeline marks the failed detect stage');
});

test('recovery: inspecting a valid URL after an error works (served from cache within cooldown)', async () => {
  document.getElementById('url-input').value = 'https://github.com/flessan';
  submitForm();
  await sleep(120);

  assert.equal(document.getElementById('resolver-error').hidden, true);
  assert.equal(document.getElementById('result-area').hidden, false);
  const rail = document.getElementById('status-bar').textContent;
  assert.ok(rail.includes('CACHED'), `within guard cooldown the cached copy is served: ${rail}`);
});

test('share URLs encode only the instruction, never the response', async () => {
  const { buildShareUrl, parseShareTarget } = await import('../src/core/share.js');
  const share = buildShareUrl('https://github.com/flessan', { base: 'https://user.github.io/gitapi-dev/' });
  assert.ok(share.startsWith('https://user.github.io/gitapi-dev/#/inspect?u='));
  assert.ok(!share.includes('flessan%22') && !share.includes('public_repos'), 'no response data leaked');
  assert.equal(parseShareTarget(share.slice(share.indexOf('#'))), 'https://github.com/flessan');
});
