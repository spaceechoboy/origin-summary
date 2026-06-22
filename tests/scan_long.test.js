// tests/scan_long.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanLong } from '../src/scan_long.js';
import { i32 } from '../src/codec.js';

const WALLET = '0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d';
const GONS = 777n;
const word = (n) => '0x' + i32(n);
// stakes() 8워드: [principal, gons, 0,0,0,0,0, active=1]
function stakesWords(principal, gons) {
  return '0x' + i32(principal) + i32(gons) + i32(0).repeat(5) + i32(1);
}

test('scanLong: 단일 stake 세분(interest/unlocked/extra) 정확', async () => {
  const P = 1000n * 10n ** 9n;          // principal 1000
  const BFG = 1012044700000n;           // balanceForGons → 1012.0447
  const PEND = 5n * 10n ** 9n;          // unlocked 5
  const XTRA = 3n * 10n ** 9n;          // extra 3
  // LONG600만 1개 stake, 나머지 컨트랙트는 count=0
  const call = async (to, data) => {
    const sel = data.slice(0, 10);
    if (sel === '0x98dc8dea') {          // getUserStakesCount
      return to.toLowerCase() === '0x8ca97f41d2c81af050656e8ad0cf543820a24504' ? word(1) : word(0);
    }
    if (sel === '0x584b62a1') return stakesWords(P, GONS);  // stakes
    if (sel === '0x7965d56d') return word(BFG);             // balanceForGons
    if (sel === '0xda709204') return word(PEND);            // pendingPayout
    if (sel === '0xb01d3563') return word(XTRA);            // extraInterest
    return word(0);
  };
  const positions = await scanLong(WALLET, 'polygon', call);
  assert.equal(positions.length, 1);
  const p = positions[0];
  assert.equal(p.positionType, 'long_stake');
  assert.equal(p.contractName, 'LONG600');
  assert.equal(p.principalLgns, 1000);
  assert.equal(Number(p.interestLgns.toFixed(4)), 12.0447);
  assert.equal(p.unlockedPrincipalLgns, 5);
  assert.equal(p.extraLgns, 3);
  assert.equal(Number(p.holdingLgns.toFixed(4)), 1015.0447); // principal+interest+extra
  assert.equal(p.claimableNow, true);
});

test('scanLong: active=0 stake는 제외', async () => {
  const call = async (to, data) => {
    const sel = data.slice(0, 10);
    if (sel === '0x98dc8dea') return to.toLowerCase() === '0x8ca97f41d2c81af050656e8ad0cf543820a24504' ? word(1) : word(0);
    if (sel === '0x584b62a1') return '0x' + i32(1000n * 10n ** 9n) + i32(1) + i32(0).repeat(5) + i32(0); // active=0
    return word(0);
  };
  const positions = await scanLong('0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d', 'polygon', call);
  assert.equal(positions.length, 0);
});

test('scanLong: principal==0(active=1) stake는 제외', async () => {
  const LONG600 = '0x8ca97f41d2c81af050656e8ad0cf543820a24504';
  const call = async (to, data) => {
    const sel = data.slice(0, 10);
    if (sel === '0x98dc8dea') return to.toLowerCase() === LONG600 ? word(1) : word(0);
    if (sel === '0x584b62a1') return '0x' + i32(0) + i32(1) + i32(0).repeat(5) + i32(1); // principal=0, active=1
    return word(0);
  };
  const positions = await scanLong(WALLET, 'polygon', call);
  assert.equal(positions.length, 0);
});

test('scanLong: QUOTA360(has_extra=false)는 extraInterest 미호출, extra=0', async () => {
  const QUOTA = '0x25a4b842cb200e9148ff5a11babf80488c8d8b07';
  let extraCalled = false;
  const call = async (to, data) => {
    const sel = data.slice(0, 10);
    if (sel === '0xb01d3563') { extraCalled = true; return word(9n * 10n ** 9n); }
    if (sel === '0x98dc8dea') return to.toLowerCase() === QUOTA ? word(1) : word(0);
    if (sel === '0x584b62a1') return stakesWords(100n * 10n ** 9n, GONS);
    if (sel === '0x7965d56d') return word(100n * 10n ** 9n); // balanceForGons == principal → interest 0
    if (sel === '0xda709204') return word(0); // pendingPayout 0
    return word(0);
  };
  const positions = await scanLong(WALLET, 'polygon', call);
  assert.equal(positions.length, 1);
  assert.equal(positions[0].contractName, 'QUOTA360');
  assert.equal(positions[0].extraLgns, 0);
  assert.equal(extraCalled, false);
});
