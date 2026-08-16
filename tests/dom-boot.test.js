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
  assert.equal(fetchMock.calls.length, 0, 'no request happens before the user acts');
});

test('inspect: GitHub user URL renders a LIVE result with all four tabs', async () => {
  document.getElementById('url-input').value = 'https://github.com/flessan';
  submitForm();
  await sleep(120);

  assert.equal(fetchMock.calls.length, 1, 'exactly one direct provider request');
  assert.ok(fetchMock.calls[0].url.startsWith('https://api.github.com/users/flessan'));
  assert.equal(fetchMock.calls[0].init.credentials, 'omit', 'credentials never sent');

  assert.equal(document.getElementById('result-area').hidden, false);
  const status = document.getElementById('status-bar').textContent;
  assert.ok(status.includes('api.github.com/users/flessan'), `status bar shows endpoint, got: ${status}`);
  assert.ok(status.includes('LIVE'), `LIVE badge shown, got: ${status}`);
  assert.ok(status.includes('200'), 'status 200 shown');

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

  const status = document.getElementById('status-bar').textContent;
  assert.ok(status.includes('CACHED'), `CACHED badge shown, got: ${status}`);
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

test('resolver: unsupported host shows an error and sends nothing', async () => {
  document.getElementById('url-input').value = 'https://unknown.example.com/some/repo';
  submitForm();
  await sleep(60);

  const box = document.getElementById('resolver-error');
  assert.equal(box.hidden, false);
  assert.ok(box.textContent.includes('unsupported-provider'));
  assert.ok(box.textContent.includes('No request was sent'));
  assert.equal(document.getElementById('result-area').hidden, true);
  assert.equal(fetchMock.calls.length, 1, 'still only the one earlier live request');
});

test('recovery: inspecting a valid URL after an error works (served from cache within cooldown)', async () => {
  document.getElementById('url-input').value = 'https://github.com/flessan';
  submitForm();
  await sleep(120);

  assert.equal(document.getElementById('resolver-error').hidden, true);
  assert.equal(document.getElementById('result-area').hidden, false);
  const status = document.getElementById('status-bar').textContent;
  assert.ok(status.includes('CACHED'), `within guard cooldown the cached copy is served, got: ${status}`);
});

test('share URLs encode only the instruction, never the response', async () => {
  const { buildShareUrl, parseShareTarget } = await import('../src/core/share.js');
  const share = buildShareUrl('https://github.com/flessan', { base: 'https://user.github.io/gitapi-dev/' });
  assert.ok(share.startsWith('https://user.github.io/gitapi-dev/#/inspect?u='));
  assert.ok(!share.includes('flessan%22') && !share.includes('public_repos'), 'no response data leaked');
  assert.equal(parseShareTarget(share.slice(share.indexOf('#'))), 'https://github.com/flessan');
});
