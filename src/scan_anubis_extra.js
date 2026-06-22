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
  return out;
}
