// tests/contracts.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACTS } from '../contracts.js';

test('contracts: 양 체인 id', () => {
  assert.equal(CONTRACTS.chains.polygon.chain_id, 137);
  assert.equal(CONTRACTS.chains.anubis.chain_id, 6714);
});
test('contracts: 핵심 셀렉터 존재', () => {
  assert.equal(CONTRACTS.function_selectors._staking_long.stakes, '0x584b62a1');
  assert.equal(CONTRACTS.anubis.flexible.read_selector, '0x66b223fb');
  assert.equal(CONTRACTS.function_selectors._staking_long.balanceForGons, '0x7965d56d');
  assert.equal(CONTRACTS.anubis.community_reward.claimable_selector, '0x402914f5');
});
