// src/scan_anubis_extra.js — Anubis flexible(쿨다운) + community reward. 포팅: anubis.py:96-154.
import { CONTRACTS } from '../contracts.js';
import { enc32, toLgns } from './codec.js';

function uintOf(hex) { return (!hex || hex === '0x') ? 0n : BigInt(hex.slice(0, 66)); }

export async function scanAnubisExtra(wallet, call) {
  const out = [];
  const flex = CONTRACTS.anubis.flexible;
  const cr = CONTRACTS.anubis.community_reward;

  // flexible
  const redeem = uintOf(await call(flex.address, flex.read_selector + enc32(wallet)));
  const total  = uintOf(await call(flex.address, flex.total_selector + enc32(wallet))) || redeem;
  const cd     = uintOf(await call(flex.address, flex.cooldown_selector + enc32(wallet)));
  const unlock = uintOf(await call(flex.address, flex.unlock_selector + enc32(wallet)));
  const amount = total; // total already falls back to redeem above
  if (amount > 0n) {
    const v = toLgns(amount), rv = toLgns(redeem), cv = toLgns(cd);
    let note = `flexible 전체 ${v.toFixed(6)} · redeemable ${rv.toFixed(6)}`;
    if (cd > 0n) note += ` · 쿨다운 ${cv.toFixed(6)}(해제 ${Number(unlock)})`;
    out.push({
      wallet, chain: 'anubis', contractName: 'anubis_flexible', contractAddr: flex.address,
      positionType: 'flexible_stake', stakeIndex: null,
      principalLgns: v, interestLgns: 0, unlockedPrincipalLgns: rv, extraLgns: 0,
      pendingLgns: rv, cooldownLgns: cv, cooldownUnlock: cd > 0n ? Number(unlock) : 0,
      holdingLgns: v, claimableNow: redeem > 0n, note
    });
  }

  // community reward
  const crRaw = uintOf(await call(cr.address, cr.claimable_selector + enc32(wallet)));
  if (crRaw > 0n) {
    const v = toLgns(crRaw);
    out.push({
      wallet, chain: 'anubis', contractName: 'anubis_community_reward', contractAddr: cr.address,
      positionType: 'community_reward', stakeIndex: null,
      principalLgns: 0, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
      pendingLgns: v, cooldownLgns: 0, cooldownUnlock: 0,
      holdingLgns: v, claimableNow: true, note: `Community Reward 잔여 ${v.toFixed(6)} LGNS`
    });
  }

  // Burn&Bond 소각채권 — DAI 표시. 단일값 getter(struct 0x2a5bf6d2는 동적 ABI 오프셋이라 회피).
  // 0xac541224=원금 DAI(18dec) · 0xb79215d6=소각 LGNS(9dec) · rate 250%(문서 확정). 정본 vault anubis-burn-bond-mechanism.
  const bb = CONTRACTS.anubis.burn_bond;
  if (bb) {
    const principalDaiRaw = uintOf(await call(bb.address, bb.principal_dai_selector + enc32(wallet)));
    if (principalDaiRaw > 0n) {
      const principalDai = Number(principalDaiRaw) / 1e18;                 // DAI 18 dec
      const burnedLgns = toLgns(uintOf(await call(bb.address, bb.burned_selector + enc32(wallet))));
      const ratePct = bb.rate_pct || 250;                                  // 총 지급 250%(원금 대비)
      const totalOwedDai = principalDai * ratePct / 100;
      out.push({
        wallet, chain: 'anubis', contractName: 'anubis_burnbond', contractAddr: bb.address,
        positionType: 'burn_bond', stakeIndex: null,
        principalLgns: 0, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
        pendingLgns: 0, cooldownLgns: 0, cooldownUnlock: 0, holdingLgns: 0,
        principalDai, totalOwedDai, burnedLgns, ratePct,                   // DAI 표시 채권 전용 필드
        claimableNow: false,
        note: `Burn&Bond 소각채권 — 원금 ${principalDai.toFixed(2)} DAI · 총 지급예정 ${totalOwedDai.toFixed(2)} DAI(${ratePct}%) · 소각 ${burnedLgns.toFixed(2)} LGNS`
      });
    }
  }
  return out;
}
