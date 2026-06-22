// src/rpc.js — JSON-RPC eth_call 전송. read-only. nxy index.html:404-557 재사용.
import { CONTRACTS } from '../contracts.js';

export let POLY_RPC = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
  "https://polygon.llamarpc.com"
];
export let ANU_RPC = CONTRACTS.chains.anubis.rpc_primary ?? "https://rpc.anubispace.org";
export function setPolyRpc(urls) { if (Array.isArray(urls) && urls.length) POLY_RPC = urls; }
export function setAnuRpc(url) { if (url) ANU_RPC = url; }

export async function rpcCall(url, method, params) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

export async function polyCall(to, data) {
  for (const u of POLY_RPC) {
    try { const r = await rpcCall(u, 'eth_call', [{ to, data }, 'latest']); if (r) return r; }
    catch (e) { /* 다음 RPC */ }
  }
  return null;
}
export async function anuCall(to, data) {
  try { return (await rpcCall(ANU_RPC, 'eth_call', [{ to, data }, 'latest'])) || null; }
  catch (e) { return null; }
}

// 동시성 제한 병렬(공개 RPC 레이트리밋 완화). 입력 순서 보존.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
