import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffJson } from '../src/core/diff.js';

test('identical values produce no findings', () => {
  assert.deepEqual(diffJson({ a: 1 }, { a: 1 }), []);
});

test('added, removed and changed fields are detected', () => {
  const findings = diffJson({ a: 1, b: 2, d: { x: true } }, { a: 1, c: 3, d: { x: false } });
  const byPath = Object.fromEntries(findings.map((f) => [f.path, f]));
  assert.equal(byPath['$.b'].type, 'removed');
  assert.equal(byPath['$.c'].type, 'added');
  assert.equal(byPath['$.d.x'].type, 'changed');
  assert.equal(byPath['$.d.x'].before, true);
  assert.equal(byPath['$.d.x'].after, false);
});

test('arrays are compared by index (documented behavior)', () => {
  const findings = diffJson([1, 2, 3], [1, 9]);
  const changed = findings.find((f) => f.path === '$.1');
  assert.equal(changed.type, 'changed');
  const removed = findings.find((f) => f.path === '$.2');
  assert.equal(removed.type, 'removed');
});

test('type change is reported as changed', () => {
  const findings = diffJson({ a: { b: 1 } }, { a: 'now a string' });
  assert.equal(findings[0].path, '$.a');
  assert.equal(findings[0].type, 'changed');
});

test('inputs are never mutated', () => {
  const a = { nested: { keep: [1, 2] } };
  const b = { nested: { keep: [1, 3] } };
  const aCopy = JSON.stringify(a);
  const bCopy = JSON.stringify(b);
  diffJson(a, b);
  assert.equal(JSON.stringify(a), aCopy);
  assert.equal(JSON.stringify(b), bCopy);
});

test('findings are capped for huge payloads', () => {
  const a = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i]));
  const b = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i + 1]));
  const findings = diffJson(a, b);
  assert.ok(findings.length <= 501);
});
