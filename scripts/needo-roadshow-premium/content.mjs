import {
  financing,
  scenarios,
  economics,
  market,
  sources,
  slideTitles,
} from "../needo-roadshow/data.mjs";

const yen = (value) => `${(value / 100_000_000).toFixed(0)}億日圓`;
const pct = (value) => `${(value * 100).toFixed(0)}%`;
const source = (...ids) => ids.join("、");
const sourceDetail = (ids) => ids.map((id) => {
  const item = sources.find(({ id: candidate }) => candidate === id);
  return item ? `${item.id} ${item.title}` : id;
}).join("；");

const common = {
  financing: `${financing.round} 融資 ${yen(financing.amountJpy)}、出讓 ${pct(financing.equity)} 股權；Pre-money ${yen(financing.preMoney)}、Post-money ${yen(financing.postMoney)}。`,
  market: `2025 年訪日外客 ${market.visitors2025.toLocaleString("zh-TW")} 人、年增 ${market.visitorsGrowth}%；2025 年末在留外國人 ${market.foreignResidents2025.toLocaleString("zh-TW")} 人、年增 ${market.foreignResidentsGrowth}%。`,
  unit: `店鋪 SaaS ${economics.storeSaasMonthly.toLocaleString("zh-TW")} 日圓/月、最低 ${economics.minimumContractMonths} 個月；前 ${economics.bookingFreeMonths} 個月免預約費，其後每筆 ${economics.bookingFee.toLocaleString("zh-TW")} 日圓；成功介紹費 ${economics.referralSuccessFee.toLocaleString("zh-TW")} 日圓。`,
};

const prototypeDisclosure = "目前僅為可操作原型；尚無真實歸因 GMV 或 CPS 收入，不納入核心模型，須待正式後端、交易與渠道數據驗證。";
const adultDisclosure = "成人性服務相關業態現行條款禁止；未來若評估，屬獨立受監管市場，需要獨立產品、法務與監管評估，不進入核心模型。";

const slideDefinitions = [
  ["light", "NeeDo｜讓日本服務業從人工協調走向可規模化履約", "NeeDo 把多語預約、店鋪營運、服務者調度、透明點單與 CPS 增長連成一個可追蹤的履約網路。", "S5、S7"],
  ["dark", "一個投資命題：把分散服務業變成可計算的履約網路", `核心命題是將分散供給轉成可搜尋、可確認、可調度、可結算的交易；本輪 ${common.financing}`, "S5、S7"],
  ["light", "需求側正在放大：訪日與在留外國人都創新高", common.market, source("S1", "S2")],
  ["light", "預約形式多年未變，電話與LINE仍是營運主幹", "高協調度服務仍依賴電話與 LINE 逐一確認空檔、場所、價格與變更；此頁為團隊商談觀察，待接入交易數據驗證。", "S7"],
  ["light", "真正瓶頸不是入口，而是五方即時協調與消費透明", "店鋪、中介、服務者、客人與場所共用同一筆預約事實；含稅價格、追加項目、取消與履約狀態需要在流程內可確認。", "S7；產品原型"],
  ["light", "每一個角色都在為同一筆預約重複付出", "人工找人、回撥、重排、移動與費用說明會在每次變更時重複發生；NeeDo 將事件、權限與責任集中到可審計的流程。", "S7"],
  ["light", "外國客不是沒有需求，而是被語言與不確定性擋在門外", "多語介面只是入口；客人還需要可預先確認的可接待性、總價、取消規則、場所與改約保障。", "S1、S2、S7"],
  ["light", "市場機會：先解決高摩擦服務，再擴展為生活服務基礎設施", `先從人工協調最深的店鋪與服務切入，再複製到跨城市生活服務；供給側參考包括接待飲食 ${market.receptionVenues.toLocaleString("zh-TW")}、深夜酒類 ${market.lateNightAlcoholVenues.toLocaleString("zh-TW")}、性風俗特殊營業 ${market.adultSpecialBusinesses.toLocaleString("zh-TW")}（類別可能交疊）。${adultDisclosure}`, "S1、S2、S3"],
  ["light", "高需求市場必須以合規分層進入", `一般按摩、美容、餐飲與合規店鋪 SaaS 為近期核心；有資格或特殊監管的業態採條件式、獨立法務與風控，不納入核心收入承諾。${adultDisclosure}`, "S3、S4"],
  ["dark", "NeeDo：預約、履約、調度、透明點單與CPS的一體化平台", `產品不是單一流量入口，而是把需求、供給、場所、履約與結算放進同一個作業系統；所有模組均以權限、審計與可驗證事件為邊界。${prototypeDisclosure}`, "S5、S7"],
  ["light", "一筆交易，形成可追蹤的完整履約閉環", "從發現、選擇、確認、調度、履約到結算，每一步保留可驗證資料，讓成功、取消、替補、退款與佣金都能被歸因。", "S5、S7"],
  ["light", "AI排班：把臨時變更從人力災難變成可計算決策", "以技能、可用時段、場所規則、移動時間、衝突與替補優先序產生建議；正式商用仍需真實排班資料與人工覆核。", "S7；產品原型"],
  ["light", "供給不足時，自動調配內部與外部服務者資源", "以權限、資格、距離、時間與店鋪規則分層搜尋可用服務者；外部供給只在合規審核與責任邊界清楚時啟用。", "S4、S7"],
  ["light", "平台內溝通與權益設計，降低跳單並保護隱私", "把店鋪、服務者與客人的必要訊息放在可審計的對話與訂單事件中；敏感資料按角色最小化呈現，並保留爭議處理依據。", "S5、S7"],
  ["light", "透明點單：高消費場景也能先選、再確認、全程看總額", `把含稅價格、可選項、追加確認、即時累計與明細帳單放進同一流程；正式上線前須完成支付、權限、審計與監管要求。${prototypeDisclosure}`, "S3、S7"],
  ["dark", "CPS引擎：讓達人內容直接連接可履約的服務", `內容點擊、服務選擇、預約、完單與佣金結算以同一事件鏈歸因；${prototypeDisclosure}`, "S5、S7"],
  ["light", "從點擊到結算，CPS讓每一筆增長都可歸因", `追蹤來源、服務、店鋪、訂單狀態與退款後金額，將達人增長與可履約供給連接；${prototypeDisclosure}`, "S5、S7"],
  ["light", "產品成熟度：核心體驗已可操作，後端與商業數據待本輪融資完成", `目前已有可操作原型與產品流程；本輪資金優先用於正式後端、資料庫、權限、支付、審計、商業化與真實留存／付費數據。${prototypeDisclosure}`, "S5、S7"],
  ["dark", "商業驗證：超過100家店鋪表達使用意向", "超過 100 家店鋪表達使用意向；此數字是商談訊號，不等同已簽約、已付費或已產生 GMV，後續以 CRM、合約與收款紀錄驗證。", "S7"],
  ["light", "進場策略：從痛點最深的城市與業態建立密度", "先在單城建立店鋪、服務者、場所與外國客的供需密度，再把已驗證的排班、預約、透明點單與 CPS 流程複製到第二城市與第二業態。", "S5、S7"],
  ["light", "多元收入，但同一個核心：每一次可完成的服務交易", `收入由店鋪 SaaS、預約費、成功介紹費與未來可能的 CPS 結算組成；${common.unit}${prototypeDisclosure}`, "S5、S7"],
  ["light", "單位經濟：低門檻SaaS建立關係，交易收入放大價值", `模型採用支付率 ${economics.paymentRate * 100}%、風險準備 ${economics.riskReserve} 日圓、用戶獎勵 ${economics.userReward} 日圓、雲端成本 ${economics.cloudPerOrder} 日圓/單；簡化單筆貢獻 ${economics.simplifiedOrderContribution} 日圓，須以實際數據持續校準。${prototypeDisclosure}${adultDisclosure}`, "S5"],
  ["light", "一般方案：三年形成6,000店的高密度履約網路", `一般方案店鋪 ${scenarios.general.stores.join(" → ")}；Y3 訂單 ${scenarios.general.orders[2].toLocaleString("zh-TW")}、營收 ${scenarios.general.revenueM[2]}M 日圓、淨利 ${scenarios.general.profitM[2]}M 日圓；${scenarios.general.label}。${adultDisclosure}`, "S5"],
  ["light", "激進方案：在資源與渠道更快到位時，三年挑戰10,000店", `激進方案店鋪 ${scenarios.aggressive.stores.join(" → ")}；Y3 訂單 ${scenarios.aggressive.orders[2].toLocaleString("zh-TW")}、營收 ${scenarios.aggressive.revenueM[2]}M 日圓、淨利 ${scenarios.aggressive.profitM[2]}M 日圓；${scenarios.aggressive.label}。`, "S6"],
  ["light", "2億日圓如何轉化為18個月里程碑", `資金用途依序對應正式產品、城市供給、商業化與數據驗證；18 個月目標是把原型與使用意向轉成可驗證的付費、留存、完成訂單與跨城市密度，不把預測當成承諾。${common.financing}`, "S5、S7"],
  ["dark", "投資條件與回報框架", `${common.financing} 回報取決於付費轉換、留存、完成訂單、渠道效率與合規執行；本簡報不保證估值、退出或收益。`, "S5、S6"],
  ["light", "保守情境：較慢擴張仍保留正向現金生成能力", `保守方案店鋪 ${scenarios.conservative.stores.join(" → ")}；Y3 營收 ${scenarios.conservative.revenueM[2]}M 日圓、淨利 ${scenarios.conservative.profitM[2]}M 日圓；現金最低 ${scenarios.conservative.minCashM}M 日圓（第 ${scenarios.conservative.minCashMonth} 個月）。本頁僅附錄，不是主情境承諾。`, "S5"],
  ["light", "三種情境的核心假設差異", `保守／一般／激進 Y3 店鋪分別為 ${scenarios.conservative.stores[2].toLocaleString("zh-TW")}／${scenarios.general.stores[2].toLocaleString("zh-TW")}／${scenarios.aggressive.stores[2].toLocaleString("zh-TW")}；差異來自供給拓展、渠道速度、訂單密度與執行資源，不是三個同時成立的承諾。本頁僅附錄，不是主情境承諾。`, "S5、S6"],
  ["light", "現金與損益轉正：風險集中在前10個月", `一般方案第 ${scenarios.general.positiveMonth} 個月轉正、最低現金 ${scenarios.general.minCashM}M 日圓；激進方案第 ${scenarios.aggressive.positiveMonth} 個月轉正、最低現金 ${scenarios.aggressive.minCashM}M 日圓。現金曲線依情境模型，仍受實際 CAC、留存、退款與投放節奏影響。`, "S5、S6"],
  ["light", "市場數據與引用來源", `宏觀市場、業態統計與合規依據列於來源表；${sourceDetail(["S1", "S2", "S3", "S4"])}。內部模型與商談資料另標示為內部來源，不視為第三方審計。${adultDisclosure}`, "S1、S2、S3、S4、S5、S6、S7"],
  ["dark", "合規與風險控制不是附加功能，而是產品的一部分", `以業態分層、資格審核、店鋪與服務者權限、透明價格、支付／退款、個資保護、審計與爭議流程作為產品基礎；${adultDisclosure}`, "S3、S4、S5"],
  ["light", "產品路線圖：從可操作原型到跨城市履約網路", "先完成正式後端與核心交易資料，再驗證單城付費與留存，接著複製供給密度、AI 排班、透明點單與 CPS；每一階段以可驗證指標作為下一步門檻。", "S5、S7"],
  ["light", "投資人盡調清單：我們主動把未驗證項目攤開", "待驗證項目包括付費轉換、留存、真實訂單、取消率、CAC、合規意見、支付與資料保護；投資決策應以原始合約、CRM、收款、產品日誌與模型檔案交叉核對。", "S5、S6、S7"],
  ["dark", "NeeDo｜讓服務被看見、被選擇、被完成、被分配", "以可履約服務為核心，讓需求、供給、場所與服務者在透明、合規、可追蹤的流程中完成交易。聯絡方式與資料室內容以正式盡調文件為準。", "S5、S7"],
];

export const premiumSlides = slideDefinitions.map(([mode, , statement, sourceIds], index) => ({
  page: index + 1,
  title: slideTitles[index],
  statement,
  mode,
  source: sourceIds,
  ...(index === 26 || index === 27 ? { section: "appendix" } : { section: "main" }),
}));

if (premiumSlides.length !== slideTitles.length) {
  throw new Error(`Premium slide count ${premiumSlides.length} does not match approved title count ${slideTitles.length}`);
}
