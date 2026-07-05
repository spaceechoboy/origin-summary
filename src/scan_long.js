// src/scan_long.js — long stake 스캐너. 포팅: strategies/stake_long.py.
import { CONTRACTS } from '../contracts.js';
import { enc32, i32, wWord, toLgns } from './codec.js';

const SEL = CONTRACTS.function_selectors._staking_long;
const POLY_LONG = ['LONG600', 'LONG360_V2', 'QUOTA360'];
const ANU_LONG  = ['longStaking360', 'longStaking600', 'quota360'];

function uintOf(hex) { return (!hex || hex === '0x') ? 0n : BigInt(hex.slice(0, 66)); }

// 단일 long 컨트랙트 스캔. call=(to,data)=>Promise<hex|null>.
async function scanContract(wallet, chain, name, call) {
  const meta = CONTRACTS[chain].staking[name];
  const addr = meta.address;
  const slgns = CONTRACTS[chain].tokens.sLGNS.address;
  const hasExtra = !!meta.has_extra_interest;
  const out = [];

  let count = 0;
  try {
    const cntHex = await call(addr, SEL.getUserStakesCount + enc32(wallet));
    count = Number(uintOf(cntHex));
  } catch (e) {
    return out; // 이 컨트랙트 count 취득 실패 → 빈 결과 (Python stake_long.discover_single 동일)
  }
  for (let idx = 0; idx < count; idx++) {
    try {
      const stakeHex = await call(addr, SEL.stakes + enc32(wallet) + i32(idx));
      if (!stakeHex || stakeHex === '0x') continue;
      const principalRaw = uintOf(wWord(stakeHex, 0));
      const gons = wWord(stakeHex, 1);                       // 32바이트 hex (balanceForGons 인자)
      const active = uintOf(wWord(stakeHex, 7)) === 1n;
      if (!active || principalRaw === 0n) continue;

      // interest = balanceForGons(gons) - principal  (양 체인 동일: contracts.js의 실제 sLGNS 주소)
      let interestRaw = 0n;
      const bfg = await call(slgns, SEL.balanceForGons + gons.replace(/^0x/, ''));
      if (bfg && bfg !== '0x') { const v = uintOf(bfg) - principalRaw; interestRaw = v > 0n ? v : 0n; }

      // unlocked = pendingPayout(wallet, idx)
      let pendingRaw = 0n;
      const pp = await call(addr, SEL.pendingPayout + enc32(wallet) + i32(idx));
      if (pp && pp !== '0x') pendingRaw = uintOf(pp);

      // extra = extraInterest(wallet, idx) — has_extra만
      let extraRaw = 0n;
      if (hasExtra) {
        const xi = await call(addr, SEL.extraInterest + enc32(wallet) + i32(idx));
        if (xi && xi !== '0x') extraRaw = uintOf(xi);
      }

      const principalLgns = toLgns(principalRaw);
      const interestLgns = toLgns(interestRaw);
      const unlockedPrincipalLgns = toLgns(pendingRaw);
      const extraLgns = toLgns(extraRaw);
      out.push({
        wallet, chain, contractName: name, contractAddr: addr,
        positionType: 'long_stake', stakeIndex: idx,
        principalLgns, interestLgns, unlockedPrincipalLgns, extraLgns,
        pendingLgns: interestLgns + unlockedPrincipalLgns + extraLgns,
        cooldownLgns: 0, cooldownUnlock: 0,
        // 현재가치 = balanceForGons(원금+리베이스) + 미청구 해제분(pendingPayout) + extra.
        // Dapp 정합(2026-07-05 온체인 검증: 새출발1 = principal 8295.8 + 리베이스 890.2 +
        // 해제분 404.3 + extra 129.4 ≈ Dapp 9715). 이전엔 unlocked 제외로 ~pending만큼 과소계상.
        holdingLgns: principalLgns + interestLgns + extraLgns + unlockedPrincipalLgns,
        claimableNow: (pendingRaw > 0n || interestRaw > 0n || extraRaw > 0n),
        note: `${name} stake[${idx}] term=${meta.term_days}d`
      });
    } catch (e) { /* 단일 stake 실패는 건너뜀 */ }
  }
  return out;
}

export async function scanLong(wallet, chain, call) {
  const names = chain === 'polygon' ? POLY_LONG : ANU_LONG;
  const out = [];
  for (const name of names) out.push(...await scanContract(wallet, chain, name, call));
  return out;
}
