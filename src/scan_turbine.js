// src/scan_turbine.js — Turbine charger 잔액. 포팅: strategies/turbine.py.
import { CONTRACTS } from '../contracts.js';
import { enc32, toLgns } from './codec.js';

const TURBINE = CONTRACTS.polygon.turbine.address;
const SEL_BAL = CONTRACTS.function_selectors._turbine.turbineBal;
function uintOf(hex) { return (!hex || hex === '0x') ? 0n : BigInt(hex.slice(0, 66)); }

export async function scanTurbine(wallet, call) {
  const raw = uintOf(await call(TURBINE, SEL_BAL + enc32(wallet)));
  if (raw === 0n) return [];
  const v = toLgns(raw);
  return [{
    wallet, chain: 'polygon', contractName: 'TURBINE_balance', contractAddr: TURBINE,
    positionType: 'turbine_balance', stakeIndex: null,
    principalLgns: v, interestLgns: 0, unlockedPrincipalLgns: 0, extraLgns: 0,
    pendingLgns: v, cooldownLgns: 0, cooldownUnlock: 0,
    holdingLgns: v, claimableNow: false,
    note: `Turbine charger ${v.toFixed(6)} LGNS (silence 후 vest 대기)`
  }];
}
