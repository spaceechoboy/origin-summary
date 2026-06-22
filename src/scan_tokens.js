// src/scan_tokens.js — 토큰 잔액 + 일반 sLGNS. 포팅: anubis.py / stake_normal.py.
import { CONTRACTS } from '../contracts.js';
import { enc32, toLgns } from './codec.js';

const BAL = CONTRACTS.function_selectors._erc20.balanceOf;
function uintOf(hex) { return (!hex || hex === '0x') ? 0n : BigInt(hex.slice(0, 66)); }

export async function scanTokens(wallet, chain, call) {
  const out = [];
  const tokens = CONTRACTS[chain].tokens;

  // LGNS — 직접 보유
  const lgnsRaw = uintOf(await call(tokens.LGNS.address, BAL + enc32(wallet)));
  if (lgnsRaw > 0n) {
    const v = toLgns(lgnsRaw);
    out.push(pos(wallet, chain, 'LGNS', tokens.LGNS.address, 'token_balance', v, `LGNS ${v.toFixed(6)}`));
  }
  // sLGNS — Polygon=일반 스테이킹(normal_stake_slgns), Anubis=보유(token_balance)
  if (tokens.sLGNS) {
    const sRaw = uintOf(await call(tokens.sLGNS.address, BAL + enc32(wallet)));
    if (sRaw > 0n) {
      const v = toLgns(sRaw);
      const type = chain === 'polygon' ? 'normal_stake_slgns' : 'token_balance';
      out.push(pos(wallet, chain, 'sLGNS', tokens.sLGNS.address, type, v, `sLGNS ${v.toFixed(6)}`));
    }
  }
  return out;
}

function pos(wallet, chain, name, addr, type, lgns, note) {
  return {
    wallet, chain, contractName: name, contractAddr: addr, positionType: type, stakeIndex: null,
    principalLgns: lgns, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
    pendingLgns: lgns, cooldownLgns: 0, cooldownUnlock: 0,
    holdingLgns: lgns, claimableNow: true, note
  };
}
