import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanWallet } from '../src/scanner.js';
import { i32 } from '../src/codec.js';

const W = '0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d';
const word = (n) => '0x' + i32(n);

test('scanWallet: 양 체인 포지션 통합 + 에러 격리', async () => {
  const LGNS_P = '0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01';
  const polyCall = async (to, data) =>
    (to.toLowerCase() === LGNS_P && data.startsWith('0x70a08231')) ? word(5n * 10n ** 9n) : word(0);
  const anuCall = async (to, data) =>
    data.startsWith('0x402914f5') ? word(7n * 10n ** 9n) : word(0); // community reward 7
  const res = await scanWallet(W, { polyCall, anuCall });
  const types = res.positions.map(p => p.positionType).sort();
  assert.ok(types.includes('token_balance'));      // Polygon LGNS 5
  assert.ok(types.includes('community_reward'));    // Anubis 7
  assert.equal(res.errors.length, 0);
});

test('scanWallet: 한 체인 RPC 실패해도 다른 체인 결과 유지', async () => {
  const polyCall = async () => { throw new Error('poly down'); };
  const anuCall = async (to, data) =>
    data.startsWith('0x402914f5') ? word(7n * 10n ** 9n) : word(0);
  const res = await scanWallet(W, { polyCall, anuCall });
  assert.ok(res.positions.some(p => p.positionType === 'community_reward'));
  assert.ok(res.errors.some(e => e.includes('polygon')));
});
