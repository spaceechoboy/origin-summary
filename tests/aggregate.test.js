import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, buildWallets } from '../src/aggregate.js';
import { DISPLAY } from '../src/display.js';

const W1 = '0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d';
const W2 = '0x7b555cC0cb6883C9DB047827485c6023a42A0dc3';

// long_stake: principal 1000, redeem(pending) 20 = interest12 + unlocked5 + extra3, holding 1015(=원금+이자+추가)
const longPoly = (wallet) => ({
  wallet, chain: 'polygon', contractName: 'LONG600', positionType: 'long_stake',
  principalLgns: 1000, pendingLgns: 20, interestLgns: 12, unlockedPrincipalLgns: 5, extraLgns: 3,
  holdingLgns: 1015, cooldownLgns: 0, cooldownUnlock: 0, claimableNow: true,
});
// community_reward: principal 0, redeem 26, holding 26(=청구가능)
const commAnu = (wallet) => ({
  wallet, chain: 'anubis', contractName: 'anubis_community_reward', positionType: 'community_reward',
  principalLgns: 0, pendingLgns: 26, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
  holdingLgns: 26, cooldownLgns: 0, cooldownUnlock: 0, claimableNow: true,
});

const PRICES = { polygon: 3, anubis: 2.91 };

test('aggregate: 상품 행 분해 + 매도세후 (Wallet Monitor 동일 로직)', () => {
  const a = aggregate([longPoly(W1), commAnu(W1)], DISPLAY, PRICES);
  const prod = a.chains.polygon.products[0];
  assert.equal(prod.label, '600일 장기');
  assert.equal(prod.principal_lgns, 1000);
  assert.equal(prod.redeemable_lgns, 20);
  assert.equal(prod.unlocked_lgns, 5);   // redeem(20) - rebase(12) - extra(3)
  assert.equal(prod.rebase_lgns, 12);
  assert.equal(prod.extra_lgns, 3);
  assert.equal(prod.usd, 60);            // redeem 20 * 3 (회수가능분)
  assert.equal(prod.usd_after_tax, 57);  // 60 * (1 - 0.05)
  assert.equal(prod.usd_total, 3045);              // holding 1015 * 3 (전체 보유가치)
  assert.equal(prod.usd_total_after_tax, 2892.75); // 3045 * (1 - 0.05)
});

test('aggregate: 명목합 = principal_lgns 합산(holding 아님), redeemable 별도', () => {
  const a = aggregate([longPoly(W1), commAnu(W1)], DISPLAY, PRICES);
  assert.equal(a.notional.principal_lgns, 1000); // 1000 + 0(community)
  assert.equal(a.notional.redeemable_lgns, 46);  // 20 + 26
  assert.equal(a.chains.polygon.principal_lgns, 1000);
  assert.equal(a.chains.anubis.principal_lgns, 0);
  assert.equal(a.chains.anubis.redeemable_lgns, 26);
  assert.equal(a.notional.chain_count, 2);
  assert.equal(a.notional.position_count, 2);
  assert.equal(a.notional.usd_total, 3120.66); // poly holding 1015*3 + anu community 26*2.91 = 3045 + 75.66
});

test('aggregate: 가격 없으면 usd null (NaN 없음)', () => {
  const a = aggregate([longPoly(W1)], DISPLAY, { polygon: null, anubis: null });
  assert.equal(a.chains.polygon.usd, null);
  assert.equal(a.chains.polygon.usd_after_tax, null);
  assert.equal(a.notional.usd, null);
});

test('buildWallets: 명목 보유 큰 순 정렬 + 지갑별 detail', () => {
  const results = [
    { wallet: W2, label: '작은지갑', positions: [commAnu(W2)] },        // principal 0
    { wallet: W1, label: '큰지갑', positions: [longPoly(W1)] },          // principal 1000
  ];
  const ws = buildWallets(results, DISPLAY, PRICES);
  assert.equal(ws[0].name, '큰지갑');           // 1000 먼저
  assert.equal(ws[0].principal_lgns, 1000);
  assert.equal(ws[1].name, '작은지갑');
  assert.deepEqual(ws[0].chains_present, ['polygon']);
  assert.deepEqual(ws[1].chains_present, ['anubis']);
});
