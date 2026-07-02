// src/aggregate.js — 멀티체인 포지션 집계. Wallet Monitor positions_aggregate.py를 그대로 포팅.
// 입력: scanner의 Position[](camelCase 필드). 출력: snake_case 형태(원본 UI JS가 그대로 읽도록).
// 순수 함수. 네트워크 없음.

function round(n, d) { const f = 10 ** d; return Math.round((Number(n) || 0) * f) / f; }

// claimable_now=true 포지션의 회수 가능 LGNS(pending). 아니면 0.
function redeemable(p) { return p.claimableNow ? (Number(p.pendingLgns) || 0) : 0; }

function usdOf(lgns, price) { return price == null ? null : round(lgns * price, 4); }
function afterTax(usd, tax) { return usd == null ? null : round(usd * (1 - tax), 4); }

// (chain 한정) contractName 별 상품 행. rebase/extra는 양 체인 모두 금액(LGNS) 표기.
function aggregateProducts(positions, chain, cfg, price) {
  const labels = cfg.product_labels || {};
  const tax = (cfg.sell_tax || {})[chain] || 0;
  const groups = new Map(); // 삽입 순서 보존
  for (const p of positions) {
    if (p.positionType === 'burn_bond') continue; // 소각채권은 DAI 표시 → 전용 라인(§burn_bond)
    const cn = p.contractName || "?";
    let g = groups.get(cn);
    if (!g) { g = { count: 0, principal: 0, holding: 0, redeem: 0, rebase: 0, extra: 0, cooldown: 0, cd_unlock: 0 }; groups.set(cn, g); }
    g.count += 1;
    g.principal += Number(p.principalLgns) || 0;
    g.holding += Number(p.holdingLgns) || 0; // 전체 보유 가치(스테이크=원금+이자+추가, 리워드=청구가능)
    g.redeem += redeemable(p);
    g.rebase += Number(p.interestLgns) || 0;
    g.extra += Number(p.extraLgns) || 0;
    g.cooldown += Number(p.cooldownLgns) || 0;
    g.cd_unlock = Math.max(g.cd_unlock, Number(p.cooldownUnlock) || 0);
  }
  const rows = [];
  for (const [cn, g] of groups) {
    rows.push({
      key: cn,
      label: labels[cn] || cn,
      count: g.count,
      principal_lgns: round(g.principal, 6),
      redeemable_lgns: round(g.redeem, 6),
      // 원금 해제분 = 회수가능 중 원금/잔액분(이자·추가보상 제외). redeem = unlocked + rebase + extra.
      unlocked_lgns: round(Math.max(0, g.redeem - g.rebase - g.extra), 6),
      rebase_lgns: round(g.rebase, 6),
      extra_lgns: round(g.extra, 6),
      cooldown_lgns: round(g.cooldown, 6),
      cooldown_unlock: g.cd_unlock,
      rebase_rate: null, extra_rate: null, extra_trend: null,
      // usd/usd_after_tax = redeem가능분(회수 가능) 기준. usd_total/_after_tax = 전체 보유 가치 기준.
      usd: usdOf(g.redeem, price),
      usd_after_tax: afterTax(usdOf(g.redeem, price), tax),
      usd_total: usdOf(g.holding, price),
      usd_total_after_tax: afterTax(usdOf(g.holding, price), tax),
    });
  }
  return rows;
}

// positions → 체인별/상품별 집계 + 명목 합산. USD는 redeemable 기준.
export function aggregate(positions, cfg, prices) {
  const chainsMeta = cfg.chains || {};
  const chains = {};
  for (const ck of ["polygon", "anubis"]) {
    const cps = positions.filter((p) => p.chain === ck);
    if (!cps.length && !(ck in chainsMeta)) continue;
    const price = (prices || {})[ck];
    const tax = (cfg.sell_tax || {})[ck] || 0;
    const principal = cps.reduce((a, p) => a + (Number(p.principalLgns) || 0), 0);
    const redeem = cps.reduce((a, p) => a + redeemable(p), 0);
    const usd = usdOf(redeem, price);
    const holdingTotal = cps.reduce((a, p) => a + (Number(p.holdingLgns) || 0), 0);
    const usdTotalBase = usdOf(holdingTotal, price);
    // 소각채권(DAI 표시) — 율별(230/250) 그룹 분리 + USD(전체)에 가산. DAI≈$1.
    // 매도세후=총지급×(1-tax)(LGNS로 받아 매도 가정). 소각 LGNS는 principalLgns로 명목합/도넛에만 반영(USD 이중계산 없음).
    const bbPos = cps.filter((p) => p.positionType === 'burn_bond');
    let burnBond = null;
    if (bbPos.length) {
      const gm = new Map(); // ratePct → 그룹 누적
      for (const p of bbPos) {
        const r = (p.ratePct == null) ? -1 : Number(p.ratePct); // -1 = 율 미상(폴백)
        let g = gm.get(r);
        if (!g) { g = { count: 0, principalDai: 0, totalOwedDai: 0, burnedLgns: 0, claimableLgns: 0 }; gm.set(r, g); }
        g.count += 1;
        g.principalDai += Number(p.principalDai) || 0;
        g.totalOwedDai += Number(p.totalOwedDai) || 0;
        g.burnedLgns += Number(p.burnedLgns) || 0;
        g.claimableLgns += Number(p.pendingLgns) || 0;
      }
      const groups = [...gm.entries()].sort((a, b) => a[0] - b[0]).map(([r, g]) => {
        const gUsd = round(g.totalOwedDai, 4);
        return {
          rate_pct: r < 0 ? null : r, count: g.count,
          principal_dai: round(g.principalDai, 6), total_owed_dai: round(g.totalOwedDai, 6),
          burned_lgns: round(g.burnedLgns, 6), claimable_lgns: round(g.claimableLgns, 6),
          usd: gUsd, usd_after_tax: afterTax(gUsd, tax),
        };
      });
      const totalOwedDai = groups.reduce((a, g) => a + g.total_owed_dai, 0);
      const bbUsd = round(totalOwedDai, 4);
      burnBond = {
        groups,
        principalDai: round(groups.reduce((a, g) => a + g.principal_dai, 0), 6),
        totalOwedDai: round(totalOwedDai, 6),
        burnedLgns: round(groups.reduce((a, g) => a + g.burned_lgns, 0), 6),
        claimableLgns: round(groups.reduce((a, g) => a + g.claimable_lgns, 0), 6),
        usd: bbUsd, usd_after_tax: afterTax(bbUsd, tax),
      };
    }
    const usdTotal = (usdTotalBase == null && !burnBond) ? null : round((usdTotalBase || 0) + (burnBond ? burnBond.usd : 0), 4);
    const usdTotalAfterBase = afterTax(usdTotalBase, tax);
    const usdTotalAfter = (usdTotalAfterBase == null && !burnBond) ? null : round((usdTotalAfterBase || 0) + (burnBond ? (burnBond.usd_after_tax || 0) : 0), 4);
    chains[ck] = {
      key: ck,
      name: (chainsMeta[ck] || {}).name || ck,
      chain_id: (chainsMeta[ck] || {}).chain_id,
      explorer: (chainsMeta[ck] || {}).explorer || "",
      sell_tax: tax,
      sell_tax_live: !!((cfg.sell_tax_live || {})[ck]), // true=온체인 실측, false=config fallback

      position_count: cps.length,
      wallet_count: new Set(cps.map((p) => p.wallet)).size,
      principal_lgns: round(principal, 6),
      redeemable_lgns: round(redeem, 6),
      usd,
      usd_after_tax: afterTax(usd, tax),
      usd_total: usdTotal,
      usd_total_after_tax: usdTotalAfter,
      burn_bond: burnBond,
      products: aggregateProducts(cps, ck, cfg, price),
    };
  }
  const list = Object.values(chains);
  const anyUsd = list.some((c) => c.usd != null);
  const anyTax = list.some((c) => c.usd_after_tax != null);
  const anyUsdT = list.some((c) => c.usd_total != null);
  const anyTaxT = list.some((c) => c.usd_total_after_tax != null);
  const notional = {
    position_count: list.reduce((a, c) => a + c.position_count, 0),
    chain_count: list.filter((c) => c.position_count > 0).length,
    wallet_count: new Set(positions.map((p) => p.wallet)).size,
    principal_lgns: round(list.reduce((a, c) => a + c.principal_lgns, 0), 6),
    redeemable_lgns: round(list.reduce((a, c) => a + c.redeemable_lgns, 0), 6),
    usd: anyUsd ? round(list.reduce((a, c) => a + (c.usd || 0), 0), 4) : null,
    usd_after_tax: anyTax ? round(list.reduce((a, c) => a + (c.usd_after_tax || 0), 0), 4) : null,
    usd_total: anyUsdT ? round(list.reduce((a, c) => a + (c.usd_total || 0), 0), 4) : null,
    usd_total_after_tax: anyTaxT ? round(list.reduce((a, c) => a + (c.usd_total_after_tax || 0), 0), 4) : null,
  };
  return { chains, notional };
}

// 지갑별 롤업(보유 LGNS 큰 순). 입력: scanner 결과 [{wallet,label,positions}].
export function buildWallets(walletResults, cfg, prices, shortAddr) {
  const out = [];
  for (const r of walletResults || []) {
    const positions = r.positions || [];
    const detail = aggregate(positions, cfg, prices);
    out.push({
      name: r.label || (shortAddr ? shortAddr(r.wallet) : r.wallet),
      address: r.wallet,
      principal_lgns: detail.notional.principal_lgns,
      redeemable_lgns: detail.notional.redeemable_lgns,
      chains_present: Object.values(detail.chains).filter((c) => c.position_count > 0).map((c) => c.key),
      detail,
    });
  }
  out.sort((a, b) => b.principal_lgns - a.principal_lgns);
  return out;
}
