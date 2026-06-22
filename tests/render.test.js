// tests/render.test.js — 순수 렌더 헬퍼 unit tests (TDD Step 1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtUsd, applySellTax, walletCardModel } from '../app.js';

test('fmtUsd: USD/KRW 모드', () => {
  assert.equal(fmtUsd(100, 2, 1400, 'usd'), '$200.00');
  assert.equal(fmtUsd(100, 2, 1400, 'krw'), '₩280,000');
  assert.equal(fmtUsd(100, null, 1400, 'usd'), '—'); // 시세 없음
});
test('applySellTax: 매도세 차감', () => {
  assert.equal(applySellTax(100, 10), 90);
  assert.equal(applySellTax(100, 0), 100);
});
test('walletCardModel: 요약 모델', () => {
  const wr = { wallet: '0xABCD000000000000000000000000000000001234', label: 'main',
    positions: [{ chain: 'polygon', holdingLgns: 50, positionType: 'long_stake' }] };
  const m = walletCardModel(wr);
  assert.equal(m.holdingLgns, 50);
  assert.equal(m.addr, '0xABCD…1234');
});
