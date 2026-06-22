// src/prices.js — LGNS 시세(poly/anu) + KRW 환율. 포팅: prices.py + nxy index.html.
import { CONTRACTS } from '../contracts.js';
import { rpcWords } from './codec.js';
import { polyCall as defPoly, anuCall as defAnu } from './rpc.js';

const POLY_LGNS = CONTRACTS.polygon.tokens.LGNS.address;
const SEL_RESERVES = CONTRACTS.function_selectors._lp.getReserves;

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
