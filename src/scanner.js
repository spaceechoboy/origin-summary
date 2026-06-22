// src/scanner.js — 한 지갑 전체 스캔 오케스트레이터. 포팅: scripts/scan_wallet.py.
import { polyCall as defPoly, anuCall as defAnu } from './rpc.js';
import { scanLong } from './scan_long.js';
import { scanTokens } from './scan_tokens.js';
import { scanTurbine } from './scan_turbine.js';
import { scanAnubisExtra } from './scan_anubis_extra.js';

export async function scanWallet(wallet, deps = {}) {
  const polyCall = deps.polyCall || defPoly;
  const anuCall = deps.anuCall || defAnu;
  const positions = [];
  const errors = [];

  async function run(fn, label) {
    try { positions.push(...await fn()); }
    catch (e) { errors.push(`${label}: ${String(e).slice(0, 120)}`); }
  }

  // Polygon: tokens + long + turbine
  await Promise.all([
    run(() => scanTokens(wallet, 'polygon', polyCall), 'polygon tokens'),
    run(() => scanLong(wallet, 'polygon', polyCall), 'polygon long'),
    run(() => scanTurbine(wallet, polyCall), 'polygon turbine')
  ]);
  // Anubis: tokens + long + flexible/community
  await Promise.all([
    run(() => scanTokens(wallet, 'anubis', anuCall), 'anubis tokens'),
    run(() => scanLong(wallet, 'anubis', anuCall), 'anubis long'),
    run(() => scanAnubisExtra(wallet, anuCall), 'anubis extra')
  ]);

  return { wallet, positions, errors };
}
