import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuard, DEFAULT_COOLDOWN_MS } from '../src/core/guard.js';

function guardAt(startTime = 0, cooldownMs = DEFAULT_COOLDOWN_MS) {
  let t = startTime;
  const guard = createGuard({ now: () => t, cooldownMs });
  return {
    guard,
    advance: (ms) => { t += ms; },
    now: () => t,
  };
}

test('first request for a key goes live', () => {
  const { guard } = guardAt();
  const d = guard.decide('k1');
  assert.equal(d.action, 'live');
  assert.equal(d.reason, 'first-request');
});

test('repeat within cooldown is suppressed to cache', () => {
  const { guard, advance } = guardAt();
  guard.decide('k1');
  guard.recordLive('k1');
  advance(1000);
  const d = guard.decide('k1');
  assert.equal(d.action, 'cache');
  assert.equal(d.reason, 'cooldown');
  assert.equal(d.suppressedCount, 1);
  assert.ok(d.nextLiveAt > 0);
});

test('suppression counter accumulates per key', () => {
  const { guard, advance } = guardAt();
  guard.decide('k');
  guard.recordLive('k');
  advance(500); guard.recordSuppressed('k');
  advance(500); guard.recordSuppressed('k');
  const info = guard.describe('k');
  assert.equal(info.suppressed, 2);
  assert.equal(info.cooldownMs, DEFAULT_COOLDOWN_MS);
});

test('after cooldown expires, live requests are allowed again', () => {
  const { guard, advance } = guardAt();
  guard.decide('k');
  guard.recordLive('k');
  advance(DEFAULT_COOLDOWN_MS + 1);
  const d = guard.decide('k');
  assert.equal(d.action, 'live');
  assert.equal(d.reason, 'cooldown-expired');
});

test('force always allows a live request', () => {
  const { guard, advance } = guardAt();
  guard.decide('k');
  guard.recordLive('k');
  advance(10);
  const d = guard.decide('k', { force: true });
  assert.equal(d.action, 'live');
  assert.equal(d.reason, 'forced');
});

test('keys are independent', () => {
  const { guard } = guardAt();
  guard.decide('a');
  guard.recordLive('a');
  assert.equal(guard.decide('b').action, 'live');
});

test('nextLiveAt points at cooldown end', () => {
  const { guard, advance } = guardAt(10_000, 5000);
  guard.decide('k');
  guard.recordLive('k');
  advance(100);
  const d = guard.decide('k');
  assert.equal(d.nextLiveAt, 15_000);
});
