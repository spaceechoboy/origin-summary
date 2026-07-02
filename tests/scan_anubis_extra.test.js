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

// getUserDeposits(0x2a5bf6d2) mock — 본드당 9워드 struct(온체인 실증 2026-07-02):
// [principal DAI 1e18, rate(23000/25000), 소각 LGNS 1e9, 0, 0, 52000, idx-스냅샷, start, mode]
function depositsHex(bonds) {
  const words = [i32(32), i32(bonds.length)];
  for (const b of bonds) {
    words.push(i32(b.principal), i32(b.rate), i32(b.burned),
      i32(0), i32(0), i32(52000), i32(16047651090065905n), i32(b.start || 1782720544), i32(b.mode || 1));
  }
  return '0x' + words.join('');
}

test('burn_bond: 본드별 struct read — 230%/250% 분리 · 소각 LGNS=명목 principal · 드립가능', async () => {
  const bonds = [
    { principal: 1000n * 10n ** 18n, rate: 23000n, burned: 400n * 10n ** 9n }, // 230% LGNS계
    { principal: 730n * 10n ** 18n, rate: 25000n, burned: 300n * 10n ** 9n },  // 250% DAI계
  ];
  const claimable = [8n * 10n ** 9n, 0n]; // 본드별 수령가능 드립 LGNS
  const call = async (to, data) => {
    if (to.toLowerCase() !== BB_ADDR) return word(0);
    if (data.startsWith('0x2a5bf6d2')) return depositsHex(bonds);
    if (data.startsWith('0x6f5244b1')) {
      const idx = Number(BigInt('0x' + data.slice(10 + 64)));
      return '0x' + i32(claimable[idx]);
    }
    return word(0);
  };
  const ps = await scanAnubisExtra(W, call);
  const bb = ps.filter((p) => p.positionType === 'burn_bond');
  assert.equal(bb.length, 2); // 본드 1건 = 포지션 1건 (개수 정확)
  const b230 = bb.find((p) => p.ratePct === 230), b250 = bb.find((p) => p.ratePct === 250);
  assert.equal(b230.principalDai, 1000);
  assert.equal(b230.totalOwedDai, 2300);      // 1000 × 230% (250% 고정 아님)
  assert.equal(b230.burnedLgns, 400);
  assert.equal(b230.principalLgns, 400);      // 소각 LGNS = 명목 LGNS → 도넛/명목합 반영
  assert.equal(b230.holdingLgns, 0);          // USD는 totalOwedDai로 → 이중계산 방지
  assert.equal(b230.pendingLgns, 8);          // 드립 수령가능
  assert.equal(b230.claimableNow, true);
  assert.equal(b230.stakeIndex, 0);
  assert.equal(b250.totalOwedDai, 1825);      // 730 × 250%
  assert.equal(b250.principalLgns, 300);
  assert.equal(b250.claimableNow, false);
});

test('burn_bond: struct read 실패 시 집계 getter 폴백(율 250% 가정 표기)', async () => {
  const call = async (to, data) => {
    if (to.toLowerCase() === BB_ADDR && data.startsWith('0x2a5bf6d2')) throw new Error('rpc fail');
    if (to.toLowerCase() === BB_ADDR && data.startsWith('0xac541224')) return '0x' + i32(100n * 10n ** 18n);
    if (to.toLowerCase() === BB_ADDR && data.startsWith('0xb79215d6')) return '0x' + i32(50n * 10n ** 9n);
    return word(0);
  };
  const ps = await scanAnubisExtra(W, call);
  const bb = ps.filter((p) => p.positionType === 'burn_bond');
  assert.equal(bb.length, 1);
  assert.equal(bb[0].principalDai, 100);
  assert.equal(bb[0].totalOwedDai, 250);
  assert.equal(bb[0].principalLgns, 50);      // 폴백에서도 명목 LGNS 반영
  assert.ok(bb[0].note.includes('폴백'));
});

test('burn_bond: 본드 0건이면 포지션 없음', async () => {
  const call = async (to, data) => {
    if (to.toLowerCase() === BB_ADDR && data.startsWith('0x2a5bf6d2')) return depositsHex([]);
    return word(0);
  };
  const ps = await scanAnubisExtra(W, call);
  assert.equal(ps.find((p) => p.positionType === 'burn_bond'), undefined);
});
