import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanTurbine } from '../src/scan_turbine.js';
import { i32 } from '../src/codec.js';

test('scanTurbine: turbineBal>0 → turbine_balance', async () => {
  const call = async (to, data) =>
    data.startsWith('0x780ce197') ? '0x' + i32(42n * 10n ** 9n) : '0x' + i32(0);
  const ps = await scanTurbine('0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d', call);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].positionType, 'turbine_balance');
  assert.equal(ps[0].holdingLgns, 42);
  assert.equal(ps[0].claimableNow, false); // silence(DAI 본딩) 필요
});
test('scanTurbine: 0이면 빈 배열', async () => {
  const ps = await scanTurbine('0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d', async () => '0x' + i32(0));
  assert.equal(ps.length, 0);
});
