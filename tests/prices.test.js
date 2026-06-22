// tests/prices.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDexScreener, anubisPriceFromReserves } from '../src/prices.js';

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
