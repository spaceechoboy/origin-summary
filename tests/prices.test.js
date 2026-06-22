// tests/prices.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDexScreener, anubisPriceFromReserves, computeSellTax } from '../src/prices.js';

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
test('computeSellTax: 1-(1-fee/1e5)(1-extra/1e5), PRECISION 1e5 (vault 정본)', () => {
  // Anubis 현재: feeRatio 5000(5%) + extraFeeRatio 25000(25%) = 28.75%
  assert.equal(Number(computeSellTax(5000, 25000).toFixed(6)), 0.2875);
  // Polygon: feeRatio 5000(5%), extraFeeRatio 부재(→0) = 5%
  assert.equal(Number(computeSellTax(5000, 0).toFixed(6)), 0.05);
  // Anubis 저점 레버: extraFeeRatio 15000 = 19.25%
  assert.equal(Number(computeSellTax(5000, 15000).toFixed(6)), 0.1925);
});
