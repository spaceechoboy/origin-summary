// contracts.js — LGNS/Origin 컨트랙트 주소·셀렉터 단일 출처. Polygon + Anubis.
// 온체인 read 전용(서명·tx 없음). 값은 온체인에서 검증된 것만 기재.
export const CONTRACTS = {
  chains: {
    polygon: { chain_id: 137, name: "Polygon Mainnet", explorer: "https://polygonscan.com" },
    anubis:  { chain_id: 6714, name: "Anubis Chain (LGNS L2)", rpc_primary: "https://rpc.anubispace.org", explorer: "https://browser.anubispace.org" }
  },
  polygon: {
    tokens: {
      LGNS:  { address: "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01", decimals: 9 },
      sLGNS: { address: "0x99a57E6C8558BC6689f894e068733ADf83C19725", decimals: 9 },
      DAI:   { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 }
    },
    staking: {
      STAKING:    { address: "0x1964Ca90474b11FFD08af387b110ba6C96251Bfc", type: "normal" },
      LONG600:    { address: "0x8cA97F41d2C81AF050656e8AD0Cf543820a24504", type: "long", term_days: 600, has_extra_interest: true },
      LONG360_V2: { address: "0x6652d0f0D7aEc5070804E55b7023d32B9Bbc4190", type: "long", term_days: 360, has_extra_interest: true },
      QUOTA360:   { address: "0x25a4b842cB200E9148FF5a11BAbF80488c8d8b07", type: "long", term_days: 360, has_extra_interest: false }
    },
    turbine: { address: "0x07Ff4e06865de4934409Aa6eCea503b08Cc1C78d" },
    dex: { lgns_dai_pair: "0x882df4B0fB50a229C3B4124EB18c759911485bFb" }
  },
  anubis: {
    tokens: {
      LGNS:  { address: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8", decimals: 9 },
      sLGNS: { address: "0x2243aE29F73137d678197b61B0621AE942845B8C", decimals: 9 }
    },
    staking: {
      longStaking360: { address: "0x88ea98af226Cd4402A3873400308a4D78784eCE6", type: "long", term_days: 360, has_extra_interest: true },
      longStaking600: { address: "0x04eD22c6d1D020A9B5e032E93D79ab28293EF72f", type: "long", term_days: 600, has_extra_interest: true },
      quota360:       { address: "0x1e5fEEc473f7F445fc7F5fEEC0bEABB2270b0B4E", type: "long", term_days: 360, has_extra_interest: false }
    },
    flexible: {
      address: "0xf7788f5a5cbbafac4120c63c79dcd9f1931c7824",
      read_selector: "0x66b223fb", total_selector: "0xb79215d6",
      cooldown_selector: "0x266565a9", unlock_selector: "0xd4cf8b8f"
    },
    community_reward: {
      address: "0xf7a0cacdf0810609ee5618247c4121b799e41664",
      claimable_selector: "0x402914f5"
    },
    dex: { lgns_dai_pair: "0x32A4586797E3f561F41C0F47CA57eD08D64f3dC0" }
  },
  function_selectors: {
    _erc20: { balanceOf: "0x70a08231" },
    _staking_normal: { epoch: "0x900cf0cf", warmupInfo: "0x6746f4c2" },
    _staking_long: {
      claimInterest: "0xd286f3cf", extraInterest: "0xb01d3563",
      getUserStakesCount: "0x98dc8dea", stakes: "0x584b62a1",
      pendingPayout: "0xda709204", balanceForGons: "0x7965d56d"
    },
    _turbine: { turbineBal: "0x780ce197", percentVestedFor: "0x6e979c6a" },
    _lp: { getReserves: "0x0902f1ac" },
    // 매도세 온체인 실측: 매도세 = 1-(1-feeRatio/1e5)(1-extraFeeRatio/1e5). PRECISION=1e5.
    // Polygon LGNS는 extraFeeRatio 변수 부재(→0, 5% 고정). Anubis는 둘 다 있음(가변, 현 28.75%).
    _fee: { feeRatio: "0x41744dd4", extraFeeRatio: "0x3c336ff4" }
  }
};
