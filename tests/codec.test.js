import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enc32, i32, wWord, rpcWords, hxN, toLgns, isAddress, looksLikePrivateKey } from '../src/codec.js';

test('enc32: 주소 64-hex 패딩·소문자', () => {
  assert.equal(enc32('0xAbC0000000000000000000000000000000000001'),
    '000000000000000000000000abc0000000000000000000000000000000000001');
});
test('i32: 인덱스 uint256', () => {
  assert.equal(i32(2), '0'.repeat(63) + '2');
});
test('wWord: word 인덱싱', () => {
  const hex = '0x' + '11'.repeat(32) + '22'.repeat(32);
  assert.equal(wWord(hex, 1), '0x' + '22'.repeat(32));
});
test('rpcWords: 워드 분할', () => {
  const hex = '0x' + i32(1000) + i32(7);
  assert.deepEqual(rpcWords(hex), [1000n, 7n]);
});
test('hxN: 9-dec 환산, 깨진 값 0', () => {
  assert.equal(hxN('0x' + (1000n * 10n ** 9n).toString(16).padStart(64, '0')), 1000);
  assert.equal(hxN('0x'), 0);
  assert.equal(hxN('0x' + (1000n * 10n ** 21n).toString(16).padStart(64, '0')), 0); // 1e12 LGNS → 범위 밖 → 0
});
test('toLgns: raw → LGNS', () => {
  assert.equal(toLgns(12044700000n), 12.0447);
});
test('isAddress / looksLikePrivateKey', () => {
  assert.equal(isAddress('0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d'), true);
  assert.equal(isAddress('0xnope'), false);
  assert.equal(looksLikePrivateKey('0x' + 'a'.repeat(64)), true);
  assert.equal(looksLikePrivateKey('0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d'), false);
});
