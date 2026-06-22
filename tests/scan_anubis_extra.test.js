import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanAnubisExtra } from '../src/scan_anubis_extra.js';
import { i32 } from '../src/codec.js';

const W = '0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d';
const word = (n) => '0x' + i32(n);

test('flexible: 전체=redeemable+쿨다운, holding=전체', async () => {
  const total = 100n * 10n ** 9n, redeem = 79n * 10n ** 9n, cd = 21n * 10n ** 9n, unlock = 1750000000n;
  const call = async (to, data) => {
    const s = data.slice(0, 10);
    if (s === '0xb79215d6') return word(total);
    if (s === '0x66b223fb') return word(redeem);
    if (s === '0x266565a9') return word(cd);
    if (s === '0xd4cf8b8f') return word(unlock);
    return word(0);
  };
  const ps = await scanAnubisExtra(W, call);
  const flex = ps.find(p => p.positionType === 'flexible_stake');
  assert.equal(flex.holdingLgns, 100);
  assert.equal(flex.unlockedPrincipalLgns, 79); // redeemable now
  assert.equal(flex.cooldownLgns, 21);
  assert.equal(flex.cooldownUnlock, 1750000000);
});

test('community_reward: claimable>0', async () => {
  const call = async (to, data) =>
    data.startsWith('0x402914f5') ? word(26n * 10n ** 9n) : word(0);
  const ps = await scanAnubisExtra(W, call);
  const cr = ps.find(p => p.positionType === 'community_reward');
  assert.equal(cr.holdingLgns, 26);
  assert.equal(cr.claimableNow, true);
});

test('flexible: total 0이면 redeemable 폴백 + cooldown 0이면 unlock 게이팅', async () => {
  const redeem = 50n * 10n ** 9n;
  const call = async (to, data) => {
    const s = data.slice(0, 10);
    if (s === '0xb79215d6') return word(0);            // total 0
    if (s === '0x66b223fb') return word(redeem);        // redeemable 50
    if (s === '0x266565a9') return word(0);             // cooldown 0
    if (s === '0xd4cf8b8f') return word(1750000000);    // stale unlock value (must be gated to 0)
    return word(0);
  };
  const ps = await scanAnubisExtra(W, call);
  const flex = ps.find(p => p.positionType === 'flexible_stake');
  assert.equal(flex.holdingLgns, 50);     // fell back to redeemable
  assert.equal(flex.cooldownLgns, 0);
  assert.equal(flex.cooldownUnlock, 0);   // cooldown==0 → unlock NOT leaked despite selector returning 1750000000
  assert.equal(flex.claimableNow, true);  // redeemable > 0
});

test('flexible+community 모두 0이면 포지션 없음', async () => {
  const ps = await scanAnubisExtra(W, async () => word(0));
  assert.equal(ps.length, 0);
});

const BB_ADDR = '0x11b10c9827c5b7071e96fcaa143b4e6e86b17c69'; // burn bond 컨트랙트(소문자)

test('burn_bond: 단일 getter — 원금 DAI · 250% 총지급 · 소각 LGNS', async () => {
  // 0xac541224=원금 100 DAI(18dec), 0xb79215d6=소각 50 LGNS(9dec) — burn bond 주소로만.
  const call = async (to, data) => {
    if (to.toLowerCase() === BB_ADDR && data.startsWith('0xac541224')) return '0x' + i32(100n * 10n ** 18n);
    if (to.toLowerCase() === BB_ADDR && data.startsWith('0xb79215d6')) return '0x' + i32(50n * 10n ** 9n);
    return word(0);
  };
  const ps = await scanAnubisExtra(W, call);
  const bb = ps.find((p) => p.positionType === 'burn_bond');
  assert.equal(bb.principalDai, 100);
  assert.equal(bb.totalOwedDai, 250);  // 100 × 250%
  assert.equal(bb.burnedLgns, 50);
  assert.equal(bb.ratePct, 250);
  assert.equal(bb.holdingLgns, 0);     // DAI 표시 → LGNS holding 0(중복계산 방지)
});

test('burn_bond: 원금 0이면 포지션 없음', async () => {
  const ps = await scanAnubisExtra(W, async () => word(0));
  assert.equal(ps.find((p) => p.positionType === 'burn_bond'), undefined);
});
