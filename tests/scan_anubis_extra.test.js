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
