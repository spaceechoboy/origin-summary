// src/codec.js — 온체인 데이터 인코딩/디코딩. 순수 함수. 네트워크 없음.
export function enc32(a) { return a.toLowerCase().replace(/^0x/, '').padStart(64, '0'); }
export function i32(i)   { return BigInt(i).toString(16).padStart(64, '0'); }
export function wWord(hex, i) { const h = hex.replace(/^0x/, ''); return '0x' + h.slice(i * 64, i * 64 + 64); }
export function rpcWords(hex) {
  const h = (hex || '').replace(/^0x/, ''); const o = [];
  for (let i = 0; i < h.length; i += 64) o.push(BigInt('0x' + (h.slice(i, i + 64) || '0')));
  return o;
}
export function hxN(hex) {
  if (!hex || hex === '0x') return 0;
  try { const v = Number(BigInt(hex.slice(0, 66))) / 1e9; return (v >= 0 && v < 1e12) ? v : 0; }
  catch (e) { return 0; }
}
export function toLgns(raw) { return Number(raw) / 1e9; }
export function isAddress(s) { return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s); }
export function looksLikePrivateKey(s) { return typeof s === 'string' && /^0x?[0-9a-fA-F]{64}$/.test(s.trim()); }
