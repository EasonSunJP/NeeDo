import { premiumSlides } from "../needo-roadshow-premium/content.mjs";

const intentDisclosure =
  "100+ 店鋪為使用意向，不是簽約、付費、營收或活躍店鋪；後續以 CRM、合約與收款紀錄驗證。";
const prototypeDisclosure =
  "透明點單與 CPS 目前為可操作原型；尚無真實歸因 GMV 或 CPS 收入，不納入核心財務模型。";
const adultDisclosure =
  "成人性服務相關業態現行條款禁止；不納入核心財務模型，未來如評估須另行完成產品、法務與監管審查。";
const returnDisclosure =
  "財務與投資回報為情境分析，不構成估值、退出、IRR 或收益承諾；最終條件以正式協議為準。";

const layoutByPage = [
  "hero-scene", "summary-network", "market-scene", "process-flow", "coordination-scene",
  "evidence-cards", "journey-funnel", "market-funnel", "compliance-zones",
  "platform-orbit", "fulfillment-loop", "scheduling-scene", "resource-pool", "loop-compare",
  "ordering-scene", "dual-engine-scene", "attribution-flow", "maturity-matrix",
  "validation-hero", "city-staircase", "revenue-orbit", "unit-economics",
  "native-chart", "native-chart", "funding-roadmap", "offering-summary",
  "native-chart", "scenario-tracks", "native-line-chart", "source-index",
  "governance-cards", "roadmap-scene", "dataroom-index", "hero-scene",
];

const assetByPage = new Map([
  [1, "cover"], [3, "market"], [5, "coordination"], [10, "market"],
  [12, "scheduling"], [15, "ordering"], [16, "dualEngine"], [20, "roadmap"],
  [32, "roadmap"], [34, "cover"],
]);

const disclosureByPage = new Map([
  [5, prototypeDisclosure], [8, adultDisclosure], [9, adultDisclosure],
  [15, prototypeDisclosure], [16, prototypeDisclosure], [17, prototypeDisclosure],
  [18, prototypeDisclosure], [19, intentDisclosure], [22, `${prototypeDisclosure} ${adultDisclosure}`],
  [23, adultDisclosure], [26, returnDisclosure], [30, adultDisclosure], [31, adultDisclosure],
]);

export const referenceSlides = premiumSlides.map((slide) => ({
  page: slide.page,
  title: slide.title,
  statement: slide.statement,
  source: slide.source,
  disclosure: disclosureByPage.get(slide.page) ?? "",
  layout: layoutByPage[slide.page - 1],
  asset: assetByPage.get(slide.page) ?? null,
  section: slide.page <= 26 ? "main" : "appendix",
}));

if (referenceSlides.length !== 34 || referenceSlides.some((slide, index) => slide.page !== index + 1)) {
  throw new Error("Reference-style slide map must contain pages 1 through 34 exactly once");
}

export const DISCLOSURES = {
  adult: adultDisclosure,
  intent: intentDisclosure,
  prototype: prototypeDisclosure,
  return: returnDisclosure,
};
