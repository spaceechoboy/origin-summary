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

// 소각채권 포지션(본드 1건 = 1포지션, 율별 스냅샷). 소각 LGNS = principalLgns(명목 반영).
const bbPos = (wallet, ratePct, principalDai, burnedLgns, pendingLgns, idx, paidDai = 0) => ({
  wallet, chain: 'anubis', contractName: 'anubis_burnbond', positionType: 'burn_bond', stakeIndex: idx,
  principalLgns: burnedLgns, holdingLgns: 0, pendingLgns, interestLgns: 0, extraLgns: 0,
  claimableNow: pendingLgns > 0, ratePct, principalDai, totalOwedDai: principalDai * ratePct / 100, burnedLgns,
  paidDai, remainingOwedDai: principalDai * ratePct / 100 - paidDai,
});

test('aggregate: 소각채권 율별(230/250) 그룹 분리 + 명목 LGNS·redeem 반영 + 상품 테이블 제외', () => {
  const b230a = bbPos(W1, 230, 1000, 400, 8, 0, 100);   // 이미 100 DAI 수령
  const b230b = bbPos(W1, 230, 500, 200, 0, 1, 50);     // 이미 50 DAI 수령
  const b250 = bbPos(W1, 250, 730, 300, 0, 2, 25);      // 이미 25 DAI 수령
  const a = aggregate([commAnu(W1), b230a, b230b, b250], DISPLAY, { polygon: null, anubis: 3 });
  const bb = a.chains.anubis.burn_bond;
  // 율별 그룹(오름차순: 230 → 250)
  assert.equal(bb.groups.length, 2);
  assert.deepEqual(bb.groups.map((g) => g.rate_pct), [230, 250]);
  assert.equal(bb.groups[0].count, 2);                 // 230% 본드 2건
  assert.equal(bb.groups[0].principal_dai, 1500);
  assert.equal(bb.groups[0].total_owed_dai, 3450);     // 1000×2.3 + 500×2.3
  assert.equal(bb.groups[0].burned_lgns, 600);
  assert.equal(bb.groups[0].claimable_lgns, 8);
  assert.equal(bb.groups[0].paid_dai, 150);            // 100 + 50
  assert.equal(bb.groups[0].remaining_owed_dai, 3300); // 3450 - 150
  // ★USD는 계약 총액이 아니라 남은 미지급 기준 — 이미 받은 몫을 자산으로 다시 세지 않는다
  assert.equal(bb.groups[0].usd, 3300);
  assert.equal(bb.groups[1].count, 1);
  assert.equal(bb.groups[1].total_owed_dai, 1825);     // 730×2.5
  // 체인 합계
  assert.equal(bb.totalOwedDai, 5275);
  assert.equal(bb.paidDai, 175);                       // 100 + 50 + 25
  assert.equal(bb.remainingOwedDai, 5100);             // 5275 - 175
  assert.equal(bb.burnedLgns, 900);
  // 명목 LGNS(도넛)에 소각량 포함: comm 0 + 400+200+300
  assert.equal(a.chains.anubis.principal_lgns, 900);
  assert.equal(a.notional.principal_lgns, 900);
  // redeem가능에 드립 수령가능 포함: comm 26 + 드립 8
  assert.equal(a.chains.anubis.redeemable_lgns, 34);
  // 포지션 수 = 본드 개수 그대로(1본드 1포지션)
  assert.equal(a.notional.position_count, 4);
  assert.equal(a.chains.anubis.products.find((p) => p.key === 'anubis_burnbond'), undefined); // 테이블 제외
  // USD(전체) = community holding 26*3(=78) + 남은 미지급 5100 = 5178
  // (소각 LGNS는 USD 이중계산 안 함 / 총액 5275를 쓰면 이미 받은 175를 자산으로 다시 세게 됨)
  assert.equal(a.chains.anubis.usd_total, 5178);
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

// 원금 명목합과 현재가치는 다른 질문에 답한다 — 상품 행·지갑 롤업 양쪽에서 병기되어야 한다.
// (2026-07-19 dApp 대조: dApp의 long 평가 기준 = balanceForGons+해제분+extra = holding)
test('상품 행·지갑 롤업에 holding_lgns(현재가치)가 principal과 함께 노출된다', () => {
  const a = aggregate([longPoly(W1)], DISPLAY, PRICES);
  const row = a.chains.polygon.products.find((p) => p.key === 'LONG600');
  assert.equal(row.principal_lgns, 1000);
  assert.equal(row.holding_lgns, 1015);          // 원금과 별개로 현재가치가 실려야 함
  assert.notEqual(row.holding_lgns, row.principal_lgns);

  const ws = buildWallets([{ wallet: W1, label: '지갑', positions: [longPoly(W1)] }], DISPLAY, PRICES);
  assert.equal(ws[0].principal_lgns, 1000);
  assert.equal(ws[0].holding_lgns, 1015);
});
