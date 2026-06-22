// src/prices.js — LGNS 시세(poly/anu) + KRW 환율. 포팅: prices.py + nxy index.html.
import { CONTRACTS } from '../contracts.js';
import { rpcWords } from './codec.js';
import { polyCall as defPoly, anuCall as defAnu } from './rpc.js';

const POLY_LGNS = CONTRACTS.polygon.tokens.LGNS.address;
const ANU_LGNS  = CONTRACTS.anubis.tokens.LGNS.address;
const SEL_RESERVES = CONTRACTS.function_selectors._lp.getReserves;
const SEL_FEE   = CONTRACTS.function_selectors._fee.feeRatio;
const SEL_EXTRA = CONTRACTS.function_selectors._fee.extraFeeRatio;

function uintOf(hex) { return (!hex || hex === '0x') ? 0n : BigInt(hex.slice(0, 66)); }

// pure: DexScreener API 응답에서 첫 유효 priceUsd(>0) 추출. 실패 → null.
export function parseDexScreener(data) {
  const rows = Array.isArray(data) ? data : (data && data.pairs) || [];
  for (const r of rows) {
    const v = r && r.priceUsd;
    if (v) { const f = Number(v); return (f > 0) ? f : null; }
  }
  return null;
}

// pure: Anubis LP getReserves → LGNS 가격(DAI≈$1).
// r0=LGNS(9dec), r1=DAI(18dec). price = (r1/1e18) / (r0/1e9) = (r1/r0)*1e-9.
export function anubisPriceFromReserves(r0, r1) {
  if (!r0 || BigInt(r0) <= 0n) return 0;
  return (Number(r1) / Number(r0)) * 1e-9;
}

// pure: 온체인 매도세 분율(0..1). 매도세 = 1-(1-feeRatio/1e5)(1-extraFeeRatio/1e5). PRECISION=1e5.
// 정본: vault anubis-sell-tax-19.25 / lgns-polygon-sell-tax-5pct (둘 다 PRECISION=100,000, 순차구조).
export function computeSellTax(feeRaw, extraRaw, PRECISION = 1e5) {
  const fee = Number(feeRaw) / PRECISION;
  const extra = Number(extraRaw) / PRECISION;
  const t = 1 - (1 - fee) * (1 - extra);
  return Math.max(0, Math.min(1, t));
}

// 온체인 매도세 실측(양 체인). feeRatio 읽기 실패 → 해당 체인 null(호출측이 config로 fallback).
// extraFeeRatio 부재(Polygon)는 0으로 처리 → 5%. Anubis는 가변(현 28.75%, 19.25↔28.75).
export async function fetchSellTax(deps = {}) {
  const polyCall = deps.polyCall || defPoly;
  const anuCall  = deps.anuCall  || defAnu;
  const read = async (call, token) => {
    const feeHex = await call(token, SEL_FEE);
    if (feeHex == null) return null;                      // feeRatio 실패 → fallback
    const extraHex = await call(token, SEL_EXTRA);        // 부재(Polygon) → null → 0
    return computeSellTax(uintOf(feeHex), extraHex == null ? 0n : uintOf(extraHex));
  };
  const out = { polygon: null, anubis: null };
  try { out.polygon = await read(polyCall, POLY_LGNS); } catch (e) { /* graceful */ }
  try { out.anubis  = await read(anuCall,  ANU_LGNS);  } catch (e) { /* graceful */ }
  return out;
}

async function getJson(url, timeout = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchPrices(deps = {}) {
  const polyCall = deps.polyCall || defPoly;
  const anuCall  = deps.anuCall  || defAnu;
  const fetchJson = deps.fetchJson || getJson;
  const out = { polygon: null, anubis: null, fxKrw: null, source: {} };

  // Polygon LGNS — DexScreener
  try {
    const d = await fetchJson(`https://api.dexscreener.com/tokens/v1/polygon/${POLY_LGNS}`);
    out.polygon = parseDexScreener(d);
    out.source.polygon = 'dexscreener';
  } catch (e) { /* graceful */ }

  // Anubis LGNS — LP getReserves (온체인)
  try {
    const hex = await anuCall(CONTRACTS.anubis.dex.lgns_dai_pair, SEL_RESERVES);
    if (hex) {
      const [r0, r1] = rpcWords(hex);
      out.anubis = anubisPriceFromReserves(r0, r1);
      out.source.anubis = 'onchain_pool';
    }
  } catch (e) { /* graceful */ }

  // KRW 환율 — Upbit USDT
  try {
    const u = await fetchJson('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
    if (Array.isArray(u) && u[0]) {
      out.fxKrw = u[0].trade_price;
      out.source.fxKrw = 'upbit';
    }
  } catch (e) { /* graceful */ }

  return out;
}
