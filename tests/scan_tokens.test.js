import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanTokens } from '../src/scan_tokens.js';
import { i32 } from '../src/codec.js';

const W = '0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d';
const word = (n) => '0x' + i32(n);

test('scanTokens(polygon): LGNS=token_balance, sLGNS=normal_stake_slgns', async () => {
  const LGNS = '0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01';
  const SLGNS = '0x99a57e6c8558bc6689f894e068733adf83c19725';
  const call = async (to, data) => {
    if (to.toLowerCase() === LGNS) return word(10n * 10n ** 9n);   // 10 LGNS
    if (to.toLowerCase() === SLGNS) return word(20n * 10n ** 9n);  // 20 sLGNS
    return word(0);
  };
  const ps = await scanTokens(W, 'polygon', call);
  const lgns = ps.find(p => p.contractName === 'LGNS');
  const slgns = ps.find(p => p.positionType === 'normal_stake_slgns');
  assert.equal(lgns.holdingLgns, 10);
  assert.equal(slgns.holdingLgns, 20);
});

test('scanTokens: 0 잔액은 제외', async () => {
  const ps = await scanTokens(W, 'anubis', async () => word(0));
  assert.equal(ps.length, 0);
});
