import type { Language } from "../../i18n/translations";

export interface FinanceNdpCopy {
  todayConsumption: string;
  platformNetRevenue: string;
  requestFees: string;
  userRewardCost: string;
  pendingHold: string;
  campaignDiscount: string;
  settleable: string;
  testExcluded: string;
  testPaymentChannel: string;
  testPaymentExcluded: string;
  loadFailed: string;
}

const copies: Record<Language, FinanceNdpCopy> = {
  zh: {
    todayConsumption: "今日 NDP 消费额",
    platformNetRevenue: "平台 NDP 净收入",
    requestFees: "Request 费用",
    userRewardCost: "用户返点成本",
    pendingHold: "待处理冻结",
    campaignDiscount: "活动减免",
    settleable: "正式可结算",
    testExcluded: "Test NDP 不参与结算",
    testPaymentChannel: "Test NDP 测试渠道",
    testPaymentExcluded: "Test NDP 支付，不计入正式营收或结算",
    loadFailed: "NDP 汇总读取失败"
  },
  "zh-Hant": {
    todayConsumption: "今日 NDP 消費額",
    platformNetRevenue: "平台 NDP 淨收入",
    requestFees: "Request 費用",
    userRewardCost: "使用者回饋成本",
    pendingHold: "待處理凍結",
    campaignDiscount: "活動減免",
    settleable: "正式可結算",
    testExcluded: "Test NDP 不參與結算",
    testPaymentChannel: "Test NDP 測試渠道",
    testPaymentExcluded: "Test NDP 支付，不計入正式營收或結算",
    loadFailed: "NDP 彙總讀取失敗"
  },
  ja: {
    todayConsumption: "本日の NDP 消費額",
    platformNetRevenue: "プラットフォーム NDP 純収益",
    requestFees: "Request 手数料",
    userRewardCost: "ユーザー還元コスト",
    pendingHold: "処理待ち凍結",
    campaignDiscount: "キャンペーン割引",
    settleable: "正式精算対象",
    testExcluded: "Test NDP は精算対象外",
    testPaymentChannel: "Test NDP テストチャネル",
    testPaymentExcluded: "Test NDP 支払い。正式な売上・精算には含みません",
    loadFailed: "NDP 集計を読み込めませんでした"
  },
  en: {
    todayConsumption: "Today's NDP consumption",
    platformNetRevenue: "Platform net NDP revenue",
    requestFees: "Request fees",
    userRewardCost: "User reward cost",
    pendingHold: "Pending holds",
    campaignDiscount: "Campaign discounts",
    settleable: "Formal settleable amount",
    testExcluded: "Test NDP is excluded from settlement",
    testPaymentChannel: "Test NDP test channel",
    testPaymentExcluded: "Test NDP payment; excluded from formal revenue and settlement",
    loadFailed: "Couldn't load the NDP summary"
  },
  ko: {
    todayConsumption: "오늘 NDP 사용액",
    platformNetRevenue: "플랫폼 NDP 순수익",
    requestFees: "Request 수수료",
    userRewardCost: "사용자 리워드 비용",
    pendingHold: "처리 대기 동결액",
    campaignDiscount: "캠페인 할인",
    settleable: "정식 정산 가능액",
    testExcluded: "Test NDP는 정산에서 제외",
    testPaymentChannel: "Test NDP 테스트 채널",
    testPaymentExcluded: "Test NDP 결제이며 정식 매출 및 정산에서 제외됩니다",
    loadFailed: "NDP 요약을 불러오지 못했습니다"
  }
};

export function getFinanceNdpCopy(language: Language) {
  return copies[language];
}
