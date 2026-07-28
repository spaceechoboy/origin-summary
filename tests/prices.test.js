// tests/prices.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDexScreener, anubisPriceFromReserves, polygonPriceFromReserves, computeSellTax, fetchPrices } from '../src/prices.js';

test('parseDexScreener: 첫 유효 priceUsd', () => {
  assert.equal(parseDexScreener({ pairs: [{ priceUsd: '12.5' }] }), 12.5);
  assert.equal(parseDexScreener({ pairs: [{ priceUsd: '0' }] }), null); // 깨진 0 → null
  assert.equal(parseDexScreener({ pairs: [] }), null);
});
test('anubisPriceFromReserves: LP 리저브 → 가격', () => {
  // r0=LGNS(9dec) 1000e9, r1=DAI(18dec) 1500e18 → 1.5 (anchor $1)
  const p = anubisPriceFromReserves(1000n * 10n ** 9n, 1500n * 10n ** 18n);
  assert.equal(Number(p.toFixed(6)), 1.5);
});
test('polygonPriceFromReserves: 공식 풀 리저브 → 가격 (token0=DAI 18dec / token1=LGNS 9dec)', () => {
  // Anubis 와 토큰 순서가 반대다. r0=DAI(18dec) 1500e18, r1=LGNS(9dec) 1000e9 → 1.5
  const p = polygonPriceFromReserves(1500n * 10n ** 18n, 1000n * 10n ** 9n);
  assert.equal(Number(p.toFixed(6)), 1.5);
  assert.equal(polygonPriceFromReserves(1500n * 10n ** 18n, 0n), 0); // 0 나눗셈 방어
});

test('fetchPrices: 폴리곤 시세는 공식 풀 온체인 직독 — DexScreener 는 폴백일 뿐', async () => {
  // DexScreener 가 '먼지 풀' 값을 줘도 온체인 값이 이겨야 한다(2026-07-28 실사고).
  const reserves = '0x'
    + (1500n * 10n ** 18n).toString(16).padStart(64, '0')   // DAI
    + (1000n * 10n ** 9n).toString(16).padStart(64, '0')    // LGNS
    + ''.padStart(64, '0');
  const out = await fetchPrices({
    polyCall: async () => reserves,
    anuCall: async () => null,
    fetchJson: async () => ({ pairs: [{ priceUsd: '1.82' }] }),  // 먼지 풀 가격
  });
  assert.equal(Number(out.polygon.toFixed(6)), 1.5);
  assert.equal(out.source.polygon, 'onchain_pool');
});

test('fetchPrices: 온체인 실패 시에만 DexScreener 폴백', async () => {
  const out = await fetchPrices({
    polyCall: async () => null,                               // RPC 전멸
    anuCall: async () => null,
    fetchJson: async (url) => {
      // 폴백은 반드시 '공식 풀 주소 고정 조회'여야 한다(토큰 엔드포인트 ✗).
      assert.ok(url.includes('/latest/dex/pairs/polygon/0x882df4B0fB50a229C3B4124EB18c759911485bFb')
        || !url.includes('dexscreener'), `폴백 URL 이 공식 풀 고정 조회가 아님: ${url}`);
      return { pairs: [{ priceUsd: '1.91' }] };
    },
  });
  assert.equal(out.polygon, 1.91);
  assert.equal(out.source.polygon, 'dexscreener_pair');
});

test('computeSellTax: 1-(1-fee/1e5)(1-extra/1e5), PRECISION 1e5 (vault 정본)', () => {
  // Anubis 현재: feeRatio 5000(5%) + extraFeeRatio 25000(25%) = 28.75%
  assert.equal(Number(computeSellTax(5000, 25000).toFixed(6)), 0.2875);
  // Polygon: feeRatio 5000(5%), extraFeeRatio 부재(→0) = 5%
  assert.equal(Number(computeSellTax(5000, 0).toFixed(6)), 0.05);
  // Anubis 저점 레버: extraFeeRatio 15000 = 19.25%
  assert.equal(Number(computeSellTax(5000, 15000).toFixed(6)), 0.1925);
});
