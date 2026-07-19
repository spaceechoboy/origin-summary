// src/scan_anubis_extra.js — Anubis flexible(쿨다운) + community reward + Burn&Bond. 포팅: anubis.py:96-154.
import { CONTRACTS } from '../contracts.js';
import { enc32, i32, toLgns, rpcWords } from './codec.js';

function uintOf(hex) { return (!hex || hex === '0x') ? 0n : BigInt(hex.slice(0, 66)); }

// getUserDeposits(addr) 동적 배열 디코드 → [{principalDai, ratePct, burnedLgns}] (본드당 9워드, 온체인 실증 2026-07-02).
// 레이아웃 이상(율 범위 밖·stride<8)이면 throw → 호출부가 집계 getter 폴백.
function decodeBonds(hex) {
  const w = rpcWords(hex);
  if (w.length < 2) throw new Error('bad deposits payload');
  const offIdx = Number(w[0] / 32n);            // 워드 단위 offset(바이트/32)
  const len = Number(w[offIdx]);
  if (len === 0) return [];
  const body = w.slice(offIdx + 1);
  const stride = Math.floor(body.length / len);
  if (stride < 8) throw new Error('bad bond stride ' + stride);
  const bonds = [];
  for (let k = 0; k < len; k++) {
    const b = body.slice(k * stride, (k + 1) * stride);
    const rate = Number(b[1]);
    if (!(rate >= 1000 && rate <= 100000)) throw new Error('bond rate out of range ' + rate);
    // b[3]=누적 지급된 DAI 가치(1e18), b[4]=누적 지급된 LGNS 수량(1e9).
    // 2026-07-19 시간비교로 확정(14일전 206.91 → 7일전 250.14 → 현재 287.19 DAI, 단조증가).
    // 드립은 DAI 채무를 지급 시점 시가로 LGNS 환산해 지급 → b[3]/b[4] = 평균 지급단가.
    bonds.push({
      principalDai: Number(b[0]) / 1e18, ratePct: rate / 100, burnedLgns: toLgns(b[2]),
      paidDai: Number(b[3]) / 1e18, paidLgns: toLgns(b[4]),
    });
  }
  return bonds;
}

// 정식 dApp Invite 페이지의 "Anubis Staked" 값(참조 대조용). 포지션이 아니라 단일 지표라
// Position[]에 넣지 않는다 — 넣으면 포지션 수·보유 합계가 오염된다.
// 실패(0/revert/네트워크)는 null → 화면에서 대조 줄을 숨긴다.
export async function readDappStakedAnubis(wallet, call) {
  const ag = CONTRACTS.anubis.dapp_aggregator;
  if (!ag) return null;
  try {
    const r = await call(ag.address, ag.staked_selector + enc32(wallet));
    if (!r || r === '0x') return null;
    return toLgns(uintOf(r));
  } catch (e) { return null; }
}

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

  // Burn&Bond 소각채권 — 본드별 struct read(1본드=1포지션). 율은 본드별 스냅샷(DAI=250%/LGNS·터보=230%,
  // vault anubis-burn-bond-mechanism §3.5). 소각 LGNS(struct[2])를 명목 principalLgns로 → 도넛/명목합 반영.
  // holdingLgns=0 유지: USD(전체)는 totalOwedDai(DAI)로 가산하므로 LGNS×가격 이중계산 방지.
  const bb = CONTRACTS.anubis.burn_bond;
  if (bb) {
    let bonds = null;
    try { bonds = decodeBonds(await call(bb.address, bb.deposits_selector + enc32(wallet))); }
    catch (e) { bonds = null; }
    if (bonds) {
      for (let i = 0; i < bonds.length; i++) {
        const b = bonds[i];
        let claim = 0n;
        try { claim = uintOf(await call(bb.address, bb.claimable_by_index_selector + enc32(wallet) + i32(i))); } catch (e) {}
        const claimLgns = toLgns(claim);
        const totalOwedDai = b.principalDai * b.ratePct / 100;
        // 남은 미지급 = 계약 총액 − 이미 지급분. 자산 가치는 이쪽이다(총액은 이미 받은 몫을 포함).
        const remainingOwedDai = Math.max(0, totalOwedDai - b.paidDai);
        out.push({
          wallet, chain: 'anubis', contractName: 'anubis_burnbond', contractAddr: bb.address,
          positionType: 'burn_bond', stakeIndex: i,
          principalLgns: b.burnedLgns, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
          pendingLgns: claimLgns, cooldownLgns: 0, cooldownUnlock: 0, holdingLgns: 0,
          principalDai: b.principalDai, totalOwedDai, remainingOwedDai,
          paidDai: b.paidDai, paidLgns: b.paidLgns,
          burnedLgns: b.burnedLgns, ratePct: b.ratePct,
          claimableNow: claim > 0n,
          note: `Burn&Bond ${b.ratePct}% — 원금 ${b.principalDai.toFixed(2)} DAI · 총 지급예정 ${totalOwedDai.toFixed(2)} DAI · 수령 ${b.paidDai.toFixed(2)} DAI · 남은 미지급 ${remainingOwedDai.toFixed(2)} DAI · 소각 ${b.burnedLgns.toFixed(6)} LGNS · 드립가능 ${claimLgns.toFixed(6)} LGNS`
        });
      }
    } else {
      // 폴백(struct read 실패 시에만): 집계 getter. 0xb79215d6은 소각량 근사(드립 따라 감소), 율은 250% 가정.
      const principalDaiRaw = uintOf(await call(bb.address, bb.principal_dai_selector + enc32(wallet)));
      if (principalDaiRaw > 0n) {
        const principalDai = Number(principalDaiRaw) / 1e18;
        const burnedLgns = toLgns(uintOf(await call(bb.address, bb.burned_selector + enc32(wallet))));
        const ratePct = bb.fallback_rate_pct || 250;
        const totalOwedDai = principalDai * ratePct / 100;
        out.push({
          wallet, chain: 'anubis', contractName: 'anubis_burnbond', contractAddr: bb.address,
          positionType: 'burn_bond', stakeIndex: null,
          principalLgns: burnedLgns, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
          pendingLgns: 0, cooldownLgns: 0, cooldownUnlock: 0, holdingLgns: 0,
          // 폴백은 struct를 못 읽으므로 이미 지급분(word3) 미상 → 남은 미지급=총액(과대 가능, 보수적 표기).
          principalDai, totalOwedDai, remainingOwedDai: totalOwedDai, paidDai: null, paidLgns: null,
          burnedLgns, ratePct,
          claimableNow: false,
          note: `Burn&Bond(폴백 집계) — 원금 ${principalDai.toFixed(2)} DAI · 총 지급예정 ${totalOwedDai.toFixed(2)} DAI(${ratePct}% 가정) · 소각≈ ${burnedLgns.toFixed(6)} LGNS`
        });
      }
    }
  }
  return out;
}
