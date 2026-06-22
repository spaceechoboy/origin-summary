// app.js — LGNS Summary UI. Wallet Monitor(dashboard.py)의 화면을 그대로 이식하고
// 데이터 소스만 Python 서버 → 브라우저 스캐너 + localStorage로 교체.
// 온체인 로직은 src/*에 위임. read-only.
import { scanWallet } from './src/scanner.js';
import { aggregate, buildWallets } from './src/aggregate.js';
import { DISPLAY } from './src/display.js';
import { fetchPrices } from './src/prices.js';
import { isAddress, looksLikePrivateKey } from './src/codec.js';

const LS_WALLETS = 'os_wallets', LS_CACHE = 'os_cache';
let DATA = null, _sel = null;
const S = { wallets: loadWallets(), prices: null, scanning: false, scanAt: null, results: [] };

function loadWallets() { try { return JSON.parse(localStorage.getItem(LS_WALLETS) || '[]'); } catch { return []; } }
function saveWallets() { try { localStorage.setItem(LS_WALLETS, JSON.stringify(S.wallets)); } catch {} }
function shortAddr(a) { return a.slice(0, 6) + '…' + a.slice(-4); }

// ── 포맷 헬퍼 (dashboard.py 그대로) ──
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function f2(n) { return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function f0(n) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
function usd(n) { return n == null ? '<span class="dim">—</span>' : '<span class="usd">$' + f0(n) + '</span>'; }
function ago(iso, now) { let t = Date.parse(iso) / 1000; if (!t) return "never"; let s = Math.max(0, now - Math.floor(t)); if (s < 60) return s + "s"; if (s < 3600) return Math.floor(s / 60) + "m"; if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d"; }

// ── 렌더 (dashboard.py 그대로, DATA를 읽음) ──
function pct(v, total) { return total > 0 ? ((Number(v) || 0) / total * 100).toFixed(1) + '%' : '—'; }
// Vault 정본 심볼 색(99_Meta/origin-symbol-logo.md): Polygon=적색 오리지널 #EB4323, Anubis=네온 #9FE870
const COLOR = { polygon: "#EB4323", anubis: "#9FE870" };
function go(sel) {
  _sel = sel;
  document.getElementById("tab-sum").className = "tab" + (sel ? "" : " on");
  document.getElementById("tab-det").className = "tab" + (sel ? " on" : "");
  render();
}
function donut(chains) {
  let tot = chains.reduce((a, c) => a + c.principal_lgns, 0) || 1, off = 0, segs = "", C = 439.8;
  chains.forEach(c => { let len = c.principal_lgns / tot * C; segs += '<circle cx="90" cy="90" r="70" fill="none" stroke="' + c.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(1) + ' ' + C + '" stroke-dashoffset="' + (-off).toFixed(1) + '" transform="rotate(-90 90 90)"/>'; off += len; });
  return '<svg viewBox="0 0 180 180" width="168" height="168"><circle cx="90" cy="90" r="70" fill="none" stroke="#1c2230" stroke-width="22"/>' + segs +
    '<text x="90" y="84" text-anchor="middle" fill="#c9d1d9" font-size="16" font-weight="800">' + f0(tot) + '</text><text x="90" y="103" text-anchor="middle" fill="#8b949e" font-size="9">LGNS · 명목합</text></svg>';
}
function renderSummary() {
  let s = DATA.summary, n = s.notional, chs = Object.keys(s.chains).map(k => { let c = s.chains[k]; return { key: k, name: c.name, principal_lgns: c.principal_lgns, color: COLOR[k] || "#888" }; }).filter(c => c.principal_lgns > 0);
  let tot = n.principal_lgns || 0;
  let lgd = chs.map(c => '<div class="li"><span class="sw" style="background:' + c.color + '"></span><span class="nm">' + esc(c.name) + '</span><b>' + f2(c.principal_lgns) + '</b><span class="pc">' + (tot ? (c.principal_lgns / tot * 100).toFixed(1) : 0) + '%</span></div>').join("");
  let html = '<div class="sum"><div>' + donut(chs) + '</div><div style="flex:1 1 280px"><div class="big">' + f2(tot) + '<span class="u">LGNS 보유 (명목 합산)</span></div>' +
    '<div class="meta">지갑 ' + f0(n.wallet_count) + ' · 포지션 ' + f0(n.position_count) + ' · ' + f0(n.chain_count) + '체인 ⚠ 체인 간 LGNS는 별개 토큰 — 명목 합</div>' +
    '<div class="lgd">' + lgd + '</div>' +
    '<div class="red">전체 보유가치 <b>' + usd(n.usd_total) + '</b> · 매도세후 <b>' + usd(n.usd_total_after_tax) + '</b></div>' +
    '<div class="red" style="font-size:12px;color:#8b949e">redeem가능(명목) ' + f2(n.redeemable_lgns) + ' LGNS · ' + usd(n.usd) + ' → 매도세후 ' + usd(n.usd_after_tax) + '</div></div></div>';
  if (!DATA.wallets.length) { return html + '<div class="empty">등록된 지갑이 없습니다. 아래 "+ 지갑 추가"로 등록하세요.</div>'; }
  html += '<p style="color:#8b949e;font-size:11px;margin:4px 0">지갑 선택 (클릭 → 상세):</p><div class="chips">';
  DATA.wallets.forEach(w => { html += '<div class="chip" onclick="go(\'' + esc(w.name) + '\')">' + esc(w.name) + ' <b>' + f0(w.principal_lgns) + '</b><span class="s">' + w.chains_present.map(c => c === "polygon" ? "▣Poly" : "▪Anu").join(" ") + '</span></div>'; });
  return html + '</div>';
}
function chainBlock(c, walletTotal) {
  let rows = c.products.map(p => {
    let reb = p.rebase_lgns ? '<span class="pur">' + f2(p.rebase_lgns) + '</span>' : '<span class="dim">—</span>';
    let ext = p.extra_lgns ? '<span class="pur">' + f2(p.extra_lgns) + '</span>' : '<span class="dim">—</span>';
    let cd = "";
    if (p.cooldown_lgns > 0) { let left = p.cooldown_unlock - DATA.now; let rem = left > 0 ? (" 해제 " + Math.floor(left / 3600) + "h" + Math.floor((left % 3600) / 60) + "m") : ""; cd = ' <span class="yel" style="font-size:10px">· 쿨다운 ' + f2(p.cooldown_lgns) + rem + '</span>'; }
    return '<tr><td>' + esc(p.label) + ' <span class="cnt">' + p.count + '</span>' + cd + '</td><td>' + f2(p.principal_lgns) + '</td><td class="dim">' + pct(p.principal_lgns, walletTotal) + '</td><td class="grn">' + f2(p.unlocked_lgns) + '</td><td>' + reb + '</td><td>' + ext + '</td><td>' + usd(p.usd_total) + '</td><td>' + usd(p.usd_total_after_tax) + '</td></tr>';
  }).join("");
  return '<div class="chain"><div class="chead"><div class="nm"><span class="dot" style="background:' + (COLOR[c.key] || "#888") + '"></span>' + esc(c.name) + ' <span class="ct">· 매도세 ' + (c.sell_tax * 100).toFixed(2) + '%</span></div><div class="ct">' + c.position_count + ' 포지션 · 지갑 내 ' + pct(c.principal_lgns, walletTotal) + '</div></div>' +
    '<div class="chsum"><span>예치</span><b>' + f2(c.principal_lgns) + '</b><span>비중</span><b>' + pct(c.principal_lgns, walletTotal) + '</b><span>redeem가능</span><b class="grn">' + f2(c.redeemable_lgns) + '</b><span>USD(전체)</span>' + usd(c.usd_total) + '<span>매도세후</span>' + usd(c.usd_total_after_tax) + '</div>' +
    '<table class="m"><thead><tr><th>상품</th><th>예치</th><th>비중</th><th>원금 해제분</th><th>rebase interest</th><th>extra interest</th><th>USD</th><th>매도세후</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function renderDetail(name) {
  let w = (DATA.wallets || []).filter(x => x.name === name)[0];
  if (!w) return '<div class="empty">지갑을 찾을 수 없습니다.</div>';
  let html = '<span class="back" onclick="go(null)">← 요약으로</span>' +
    '<div class="chead" style="border-radius:8px;margin-bottom:10px"><div class="nm">' + esc(w.name) + ' <span class="ct">' + esc(w.address) + '</span></div><div class="ct">' + f2(w.principal_lgns) + ' LGNS</div></div>';
  let walletTotal = w.principal_lgns || 0;
  Object.keys(w.detail.chains).forEach(k => { let c = w.detail.chains[k]; if (c.position_count > 0) html += chainBlock(c, walletTotal); });
  return html;
}
function renderStatus() {
  if (!DATA) return;
  let p = ["scan " + ago(DATA.scan_completed_at, DATA.now) + " ago"];
  const pr = DATA.prices || {};
  const px = [];
  if (pr.polygon) px.push("Poly $" + Number(pr.polygon).toFixed(2));
  if (pr.anubis) px.push("Anu $" + Number(pr.anubis).toFixed(2));
  if (px.length) p.push("LGNS " + px.join(" · "));
  if (DATA.scanning) p.push("⟳ 스캔 중…");
  const st = document.getElementById("status"); if (st) st.textContent = p.join("  ·  ");
  const b = document.getElementById("rescan"); if (b) { b.disabled = !!DATA.scanning; b.textContent = DATA.scanning ? "⟳ 스캔 중…" : "↻ 즉시 스캔"; }
}
function render() { if (!DATA) return; renderStatus(); document.getElementById("view").innerHTML = _sel ? renderDetail(_sel) : renderSummary(); }

// ── 데이터 조립 (Python api_payload 대응) ──
function buildDATA() {
  const all = S.results.flatMap(r => r.positions || []);
  DATA = {
    now: Math.floor(Date.now() / 1000),
    prices: S.prices,
    scanning: S.scanning,
    scan_completed_at: S.scanAt,
    summary: aggregate(all, DISPLAY, S.prices),
    wallets: buildWallets(S.results, DISPLAY, S.prices, shortAddr),
  };
  try { localStorage.setItem(LS_CACHE, JSON.stringify({ results: S.results, prices: S.prices, scanAt: S.scanAt })); } catch {}
}

async function scanAll() {
  S.scanning = true;
  const b = document.getElementById("rescan"); if (b) { b.disabled = true; b.textContent = "⟳ 스캔 중…"; }
  if (!S.wallets.length) { S.results = []; }
  else {
    S.results = await Promise.all(S.wallets.map(w =>
      scanWallet(w.addr).then(r => ({ ...r, label: w.label })).catch(() => ({ wallet: w.addr, label: w.label, positions: [], errors: ['scan failed'] }))
    ));
    S.prices = await fetchPrices().catch(() => null);
  }
  S.scanAt = new Date().toISOString();
  S.scanning = false;
  buildDATA(); render();
}
function rescan() { scanAll(); }
function addW() {
  const a = (document.getElementById("aw-addr").value || "").trim();
  const n = (document.getElementById("aw-name").value || "").trim();
  const m = document.getElementById("aw-msg");
  if (looksLikePrivateKey(a)) { m.textContent = "✗ 개인키 형태는 입력 불가 (주소만)"; m.style.color = "#f85149"; return; }
  if (!isAddress(a)) { m.textContent = "✗ 올바른 주소(0x+40hex)가 아닙니다"; m.style.color = "#f85149"; return; }
  if (S.wallets.some(w => w.addr.toLowerCase() === a.toLowerCase())) { m.textContent = "이미 등록된 지갑입니다"; m.style.color = "#d29922"; return; }
  S.wallets.push({ addr: a, label: n }); saveWallets();
  m.textContent = "✓ 추가됨: " + (n || shortAddr(a)); m.style.color = "#3fb950";
  document.getElementById("aw-addr").value = ""; document.getElementById("aw-name").value = "";
  scanAll();
}
function clearW() {
  if (!confirm("등록 지갑을 전부 비웁니다(이 브라우저에서만, 복구 불가). 진행?")) return;
  S.wallets = []; saveWallets(); S.results = []; S.prices = null; _sel = null;
  try { localStorage.removeItem(LS_CACHE); } catch {}
  buildDATA(); go(null);
}

// ── 초기화: 캐시 먼저 그리고 백그라운드 스캔 (브라우저에서만) ──
if (typeof document !== 'undefined') {
  // 이식한 템플릿의 inline onclick(go/rescan/addW/clearW)을 위해 전역 노출
  window.go = go; window.rescan = rescan; window.addW = addW; window.clearW = clearW;
  try { const c = JSON.parse(localStorage.getItem(LS_CACHE) || 'null'); if (c) { S.results = c.results || []; S.prices = c.prices || null; S.scanAt = c.scanAt || null; buildDATA(); } } catch {}
  window.addEventListener("DOMContentLoaded", () => {
    render();
    scanAll();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// 테스트용 export (순수 헬퍼)
export { shortAddr };
