// src/aggregate.js — 보유가치/청구가능 합산. value-model: holdingLgns만 합산(중복계산 방지).

function empty() {
  return {
    polygon: { holdingLgns: 0, claimableLgns: 0 },
    anubis: { holdingLgns: 0, claimableLgns: 0 }
  };
}

export function aggregateWallet(positions) {
  const byChain = empty();
  for (const p of positions) {
    const c = byChain[p.chain];
    if (!c) continue;
    c.holdingLgns += p.holdingLgns || 0;
    c.claimableLgns += p.claimableNow ? (p.pendingLgns || 0) : 0;
  }
  const totalHoldingLgns = byChain.polygon.holdingLgns + byChain.anubis.holdingLgns;
  const totalClaimableLgns = byChain.polygon.claimableLgns + byChain.anubis.claimableLgns;
  return { byChain, totalHoldingLgns, totalClaimableLgns };
}

export function aggregateAll(walletResults) {
  const byChain = empty();
  for (const w of walletResults) {
    const a = aggregateWallet(w.positions || []);
    for (const ch of ['polygon', 'anubis']) {
      byChain[ch].holdingLgns += a.byChain[ch].holdingLgns;
      byChain[ch].claimableLgns += a.byChain[ch].claimableLgns;
    }
  }
  return {
    byChain,
    totalHoldingLgns: byChain.polygon.holdingLgns + byChain.anubis.holdingLgns,
    totalClaimableLgns: byChain.polygon.claimableLgns + byChain.anubis.claimableLgns
  };
}
