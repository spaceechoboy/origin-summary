// src/display.js — 표시/집계 상수(cfg). Wallet Monitor의 config/display.json 대응.
// 매도세는 가변값(주기적 갱신 대상)이나 라이브 fetch가 아니라 config 값으로 둔다(원본 동일).
export const DISPLAY = {
  chains: {
    polygon: { name: "Polygon", chain_id: 137,  explorer: "https://polygonscan.com" },
    anubis:  { name: "Anubis",  chain_id: 6714, explorer: "https://browser.anubispace.org" },
  },
  sell_tax: { polygon: 0.05, anubis: 0.2875 },
  // 상품 라벨 — 키는 scanner가 내보내는 contractName.
  product_labels: {
    LGNS: "LGNS 잔액",
    sLGNS: "sLGNS 스테이킹",
    LONG600: "600일 장기",
    LONG360_V2: "360일 장기 v2",
    QUOTA360: "에너지값 스테이킹",
    TURBINE_balance: "Turbine",
    longStaking360: "360일 장기",
    longStaking600: "600일 장기",
    quota360: "에너지값 스테이킹",
    anubis_flexible: "일반 스테이킹(Flexible)",
    anubis_community_reward: "Community Reward(잔여)",
  },
};
