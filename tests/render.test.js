// tests/render.test.js — app.js 순수 헬퍼 + Node import 안전성(top-level DOM 접근 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortAddr } from '../app.js';

test('app.js: Node에서 import 가능(top-level DOM/window 접근 없음)', () => {
  // import가 throw 없이 성공한 것 자체가 검증. shortAddr이 노출되면 OK.
  assert.equal(typeof shortAddr, 'function');
});

test('shortAddr: 0x앞6 … 뒤4', () => {
  assert.equal(shortAddr('0x59A26bB8c1F6880991EAbc3Ae1b7937E3563D21d'), '0x59A2…D21d');
});
