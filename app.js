// app.js — Origin Summary UI (state + DOM). 온체인 로직은 src/*에 위임.
// Controller Resolution #1: 매도세 토글 UI 제거 (v1). applySellTax는 export 유지(예약).
// Controller Resolution #2: USD/KRW 토글 유지. 체인별 시세로 USD 산출.
// Controller Resolution #3: 캐시-먼저 로드 → 백그라운드 refreshAll().

import { scanWallet } from './src/scanner.js';
import { aggregateAll, aggregateWallet } from './src/aggregate.js';
import { fetchPrices } from './src/prices.js';
import { isAddress, looksLikePrivateKey } from './src/codec.js';

// ── 순수 헬퍼 (테스트 대상) ──────────────────────────────────────────

/**
 * LGNS 수량 + 시세 + 환율을 받아 화면용 문자열로 변환.
 * @param {number} lgns - LGNS 수량
 * @param {number|null} price - USD 시세 (null이면 '—' 반환)
 * @param {number} fx - KRW 환율
 * @param {'usd'|'krw'} mode
 */
export function fmtUsd(lgns, price, fx, mode) {
  if (price == null) return '—';
  const usd = lgns * price;
  if (mode === 'krw') return '₩' + Math.round(usd * (fx || 0)).toLocaleString('en-US');
  return '$' + usd.toFixed(2);
}

/**
 * 매도세 차감 (v2 예약, v1 UI에서 미사용).
 * @param {number} lgns
 * @param {number} sellTaxPct - 0~100
 */
export function applySellTax(lgns, sellTaxPct) {
  return lgns * (1 - (sellTaxPct || 0) / 100);
}

/**
 * 주소 6자+…+4자 축약.
 * @param {string} a - 0x로 시작하는 지갑 주소
 */
export function shortAddr(a) {
  return a.slice(0, 6) + '…' + a.slice(-4);
}

/**
 * walletResult → 렌더 입력 모델.
 * @param {{ wallet: string, label?: string, positions: Array }} wr
 * @returns {{ label: string, addr: string, holdingLgns: number, chains: object }}
 */
export function walletCardModel(wr) {
  const a = aggregateWallet(wr.positions || []);
  return {
    label: wr.label || '',
    addr: shortAddr(wr.wallet),
    holdingLgns: a.totalHoldingLgns,
    chains: a.byChain
  };
}

// ── DOM 이하는 Node import 시 실행하지 않는다 ──────────────────────────

if (typeof document !== 'undefined') {
  // ── 상태 + localStorage ──
  const LS_WALLETS = 'os_wallets';
  const LS_CACHE   = 'os_cache';
  const LS_MODE    = 'os_mode';

  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

  const S = {
    wallets: (() => { try { return JSON.parse(lsGet(LS_WALLETS) || '[]'); } catch { return []; } })(),
    results: [],
    prices: null,
    mode: lsGet(LS_MODE) || 'usd'
  };

  // ── 지갑 추가 (보안 검증) ──
  function addWallet(addr, label) {
    addr = (addr || '').trim();
    if (looksLikePrivateKey(addr)) throw new Error('개인키로 보이는 값은 입력할 수 없습니다 (주소만)');
    if (!isAddress(addr)) throw new Error('올바른 지갑 주소가 아닙니다');
    if (S.wallets.some(w => w.addr.toLowerCase() === addr.toLowerCase())) return;
    S.wallets.push({ addr, label: label || '' });
    lsSet(LS_WALLETS, JSON.stringify(S.wallets));
  }

  // ── 온체인 스캔 + 시세 갱신 ──
  async function refreshAll() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '새로고침 중…'; }

    S.results = await Promise.all(
      S.wallets.map(w =>
        scanWallet(w.addr)
          .then(r => ({ ...r, label: w.label }))
          .catch(() => ({ wallet: w.addr, label: w.label, positions: [], errors: ['scan failed'] }))
      )
    );
    lsSet(LS_CACHE, JSON.stringify(S.results));

    S.prices = await fetchPrices().catch(() => null);

    render();
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '새로고침'; }
  }

  // ── 상세 행 HTML 생성 ──
  function detailRows(positions) {
    const visible = (positions || []).filter(p => (p.holdingLgns || p.pendingLgns || 0) > 0);
    if (!visible.length) return '<div class="row dim">포지션 없음</div>';

    return visible.map(p => {
      const amt = (p.holdingLgns || p.pendingLgns || 0).toFixed(4);
      let html = `<div class="row">
        <span class="pos-label">[${p.chain}] ${p.contractName || p.positionType}</span>
        <span class="pos-amt">${amt} LGNS</span>
      </div>`;
      if ((p.cooldownLgns || 0) > 0) {
        const unlockDate = p.cooldownUnlock
          ? new Date(p.cooldownUnlock * 1000).toLocaleString('ko-KR')
          : '—';
        html += `<div class="row sub">쿨다운 ${p.cooldownLgns.toFixed(4)} LGNS (해제 ${unlockDate})</div>`;
      }
      return html;
    }).join('');
  }

  // ── 메인 렌더 ──
  function render() {
    const agg = aggregateAll(S.results);
    const p = S.prices || {};

    // Controller Resolution #2: 체인별 시세로 USD 산출
    const usd =
      (agg.byChain.polygon.holdingLgns * (p.polygon || 0)) +
      (agg.byChain.anubis.holdingLgns  * (p.anubis  || 0));

    // 총액 표시 (Controller Resolution #1: 매도세 적용 없음)
    const totalEl = document.getElementById('total');
    if (totalEl) {
      if (S.mode === 'krw') {
        totalEl.textContent = '₩' + Math.round(usd * (p.fxKrw || 0)).toLocaleString('en-US');
      } else {
        totalEl.textContent = '$' + usd.toFixed(2);
      }
    }

    // 모드 버튼 라벨
    const modeBtn = document.getElementById('modeBtn');
    if (modeBtn) modeBtn.textContent = S.mode === 'usd' ? 'KRW로 보기' : 'USD로 보기';

    // 지갑 카드
    const cardsEl = document.getElementById('cards');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    if (!S.wallets.length) {
      cardsEl.innerHTML = '<div class="empty-msg">지갑 주소를 추가하면 포지션이 표시됩니다.</div>';
      return;
    }

    for (const wr of S.results) {
      const m = walletCardModel(wr);
      const card = document.createElement('div');
      card.className = 'card';

      const totalLgns = m.holdingLgns;
      const cardUsd = (m.chains.polygon.holdingLgns * (p.polygon || 0)) +
                      (m.chains.anubis.holdingLgns  * (p.anubis  || 0));
      const cardVal = S.mode === 'krw'
        ? '₩' + Math.round(cardUsd * (p.fxKrw || 0)).toLocaleString('en-US')
        : '$' + cardUsd.toFixed(2);

      card.innerHTML = `
        <div class="card-head" role="button" tabindex="0" aria-expanded="false">
          <div class="card-name">${m.label ? `<span class="label">${m.label}</span>` : ''}<span class="addr">${m.addr}</span></div>
          <div class="card-val">
            <span class="lgns-amt">${totalLgns.toFixed(4)} LGNS</span>
            <span class="usd-amt">${cardVal}</span>
          </div>
          <span class="chevron">▶</span>
        </div>
        <div class="card-detail" hidden></div>
      `;

      const head   = card.querySelector('.card-head');
      const detail = card.querySelector('.card-detail');
      const chev   = card.querySelector('.chevron');

      head.addEventListener('click', () => {
        const open = !detail.hidden;
        detail.hidden = open;
        head.setAttribute('aria-expanded', String(!open));
        chev.textContent = open ? '▶' : '▼';
        if (!detail.dataset.built) {
          detail.innerHTML = detailRows(wr.positions || []);
          detail.dataset.built = '1';
        }
      });
      head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') head.click(); });

      cardsEl.appendChild(card);
    }

    // 에러 표시
    const errWallets = S.results.filter(r => r.errors && r.errors.length);
    const errBanner = document.getElementById('errBanner');
    if (errBanner) {
      if (errWallets.length) {
        errBanner.textContent = `스캔 실패 지갑: ${errWallets.map(r => shortAddr(r.wallet)).join(', ')}`;
        errBanner.hidden = false;
      } else {
        errBanner.hidden = true;
      }
    }
  }

  // ── DOM 이벤트 배선 ──
  window.addEventListener('DOMContentLoaded', () => {
    // Controller Resolution #3: 캐시 즉시 표시
    try { S.results = JSON.parse(lsGet(LS_CACHE) || '[]'); } catch {}
    render();

    // 백그라운드 새로고침
    refreshAll();

    // USD/KRW 토글
    document.getElementById('modeBtn')?.addEventListener('click', () => {
      S.mode = S.mode === 'usd' ? 'krw' : 'usd';
      lsSet(LS_MODE, S.mode);
      render();
    });

    // 지갑 추가
    document.getElementById('wAdd')?.addEventListener('click', () => {
      const addrEl  = document.getElementById('wAddr');
      const labelEl = document.getElementById('wLabel');
      const errEl   = document.getElementById('wErr');
      if (!addrEl) return;
      try {
        addWallet(addrEl.value, labelEl?.value || '');
        addrEl.value  = '';
        if (labelEl) labelEl.value = '';
        if (errEl)   errEl.textContent = '';
        refreshAll();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    });

    // Enter 키로도 추가
    document.getElementById('wAddr')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('wAdd')?.click();
    });

    // 새로고침 버튼
    document.getElementById('refreshBtn')?.addEventListener('click', () => refreshAll());
  });
}
