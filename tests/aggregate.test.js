import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWallet, aggregateAll } from '../src/aggregate.js';

const mk = (chain, holding, claimable) => ({
  chain, holdingLgns: holding, pendingLgns: claimable, positionType: 'long_stake', claimableNow: true
});

test('aggregateWallet: 체인별 holding/claimable 분리 합산', () => {
  const positions = [mk('polygon', 100, 10), mk('polygon', 50, 5), mk('anubis', 30, 3)];
  const a = aggregateWallet(positions);
  assert.equal(a.byChain.polygon.holdingLgns, 150);
  assert.equal(a.byChain.polygon.claimableLgns, 15);
  assert.equal(a.byChain.anubis.holdingLgns, 30);
  assert.equal(a.totalHoldingLgns, 180);
});

test('aggregateAll: 여러 지갑 합산', () => {
  const w1 = { positions: [mk('polygon', 100, 10)] };
  const w2 = { positions: [mk('anubis', 30, 3)] };
  const a = aggregateAll([w1, w2]);
  assert.equal(a.totalHoldingLgns, 130);
  assert.equal(a.byChain.anubis.holdingLgns, 30);
});
