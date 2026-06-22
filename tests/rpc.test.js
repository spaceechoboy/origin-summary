import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { polyCall, mapLimit } from '../src/rpc.js';

test('polyCall: 첫 RPC 성공 시 결과 반환', async () => {
  globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({ result: '0xdead' }) }));
  const r = await polyCall('0xto', '0x70a08231');
  assert.equal(r, '0xdead');
});
test('polyCall: 첫 RPC 실패 시 다음으로 폴백', async () => {
  let n = 0;
  globalThis.fetch = mock.fn(async () => {
    n++; if (n === 1) throw new Error('down');
    return { ok: true, json: async () => ({ result: '0xbeef' }) };
  });
  const r = await polyCall('0xto', '0x70a08231');
  assert.equal(r, '0xbeef');
});
test('polyCall: 비-OK HTTP(429) 응답 시 다음 RPC로 폴백', async () => {
  let n = 0;
  globalThis.fetch = mock.fn(async () => {
    n++;
    if (n === 1) return { ok: false, status: 429, json: async () => ({ result: '0xbad' }) };
    return { ok: true, json: async () => ({ result: '0xgood' }) };
  });
  const r = await polyCall('0xto', '0x70a08231');
  assert.equal(r, '0xgood');
});
test('mapLimit: 동시성 제한 하 전부 처리', async () => {
  const out = await mapLimit([1, 2, 3, 4], 2, async (x) => x * 10);
  assert.deepEqual(out, [10, 20, 30, 40]);
});
