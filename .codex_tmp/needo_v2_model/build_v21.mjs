import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const workDir = path.join(root, ".codex_tmp/needo_v2_model");
const outputDir = path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a");
const previewDir = path.join(workDir, "previews_v21");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const colors = {
  navy: "#17365D",
  darkNavy: "#0B2D44",
  blue: "#1F4E78",
  lightBlue: "#D9EAF7",
  paleBlue: "#EAF3F8",
  input: "#FFF2CC",
  inputBlue: "#0000FF",
  linkGreen: "#008000",
  lightGreen: "#E2F0D9",
  lightRed: "#FCE4D6",
  border: "#B4C6D7",
  gray: "#F2F2F2",
  white: "#FFFFFF",
  black: "#000000",
};

const fmt = {
  raw: "#,##0;[Red](#,##0);-",
  one: "#,##0.0;[Red](#,##0.0);-",
  moneyM: "0.0;[Red](0.0);-",
  pct: "0.0%;[Red](0.0%);-",
  date: "yyyy-mm",
};

const configs = [
  {
    key: "jp",
    output: "NeeDo_3カ年財務モデル_JP_V2.1_2026-08-22_日本語版.xlsx",
    sheets: {
      dashboard: "ダッシュボード",
      assumptions: "前提条件",
      engineA: "A_36か月モデル",
      engineB: "B_36か月モデル",
      y1: "Y1月次PL",
      annual: "3カ年PL",
      cash: "キャッシュフロー",
      checks: "チェック",
      sources: "定義・出典",
    },
    t: {
      version: "V2.1",
      dashboardTitle: "NeeDo 3カ年財務モデル V2.1｜36か月チャネル・従量課金モデル（日本語版）",
      dashboardNote: "更新：2026-08-22｜初期開発費2,000万円はM01のみ｜サーバー費は固定25万円/月＋取引・アカウント従量｜店舗獲得チャネルを分解",
      assumptionsTitle: "前提条件｜編集可能な入力（青字・黄色セル）",
      assumptionsNote: "金額単位は特記のない限り日本円。シナリオA=保守、シナリオB=高成長。計算セルは数式で連動します。",
      engineATitle: "シナリオA（保守）｜36か月運営モデル",
      engineBTitle: "シナリオB（高成長）｜36か月運営モデル",
      engineNote: "月次の店舗コホート、最低契約期間、Booking無料期間、ユーザー/セラピスト、サーバー費用、eKYC開始条件を計算。金額：円。",
      y1Title: "第1年月次P&L｜12か月明細（単位：百万円、人数・件数を除く）",
      annualTitle: "3カ年P&L｜シナリオ比較（単位：百万円、人数・件数を除く）",
      cashTitle: "キャッシュフロー｜Y1月次および3カ年サマリー（単位：百万円）",
      checksTitle: "モデルチェック｜財務・契約・eKYC・サーバー費用の整合性",
      sourcesTitle: "モデル定義・出典・バージョン履歴",
      scenarioA: "シナリオA（保守）",
      scenarioB: "シナリオB（高成長）",
      parameter: "前提項目",
      unit: "単位",
      note: "根拠・説明",
      y1: "Y1",
      y2: "Y2",
      y3: "Y3",
      month: "月",
      modelMonth: "モデル月",
      sectionPolicy: "1. 契約・課金・eKYCポリシー",
      sectionScale: "2. 店舗・セラピスト・ユーザー・取引前提",
      sectionRevenue: "3. その他の収益前提",
      sectionCosts: "4. サーバー・人件費・運営費前提",
      sectionPattern: "5. 月次ランプ・季節配分",
      startMonth: "モデル開始月",
      openingCash: "期首現金",
      financing: "資金調達（各年の初月）",
      ekycEarliest: "eKYC最短開始モデル月",
      ekycUserRatio: "eKYC対象ユーザー比率",
      ekycUnit: "eKYC単価",
      storeFee: "店舗固定月額／店",
      minContract: "店舗最低契約期間",
      successFee: "新規契約成功報酬／店",
      successCoverage: "成功報酬対象新規店比率",
      salesReferralShare: "紹介・営業チャネル比率",
      organicShare: "自然流入・口コミチャネル比率",
      adEventShare: "広告・イベントチャネル比率",
      adEventCac: "広告・イベント獲得費／店",
      storeChurn: "最低契約期間終了後の月次店舗解約率",
      techChurn: "月次セラピスト離脱率",
      userChurn: "月次ローカルユーザー離脱率",
      bookingFree: "新規店舗Booking無料期間",
      bookingFee: "課金対象Booking手数料／件",
      paymentRate: "決済・ポイント精算料率",
      riskPerOrder: "履行保険・リスク引当／件",
      userRebate: "ユーザー完了取引還元／件",
      weeksPerMonth: "稼働週数／月",
      startingStores: "開始時点の稼働店舗数",
      eoyStores: "期末稼働店舗数",
      techPerStore: "稼働店舗当たりセラピスト数",
      usersPerStore: "成熟時ローカル稼働ユーザー数／店",
      ordersPerTechWeek: "セラピスト1人当たり週完了件数",
      foreignUsers: "年間外国人ユニークユーザー数",
      foreignVisits: "外国人1人当たり年間利用回数",
      capacityPerTechWeek: "セラピスト1人当たり週処理能力上限",
      s2bShare: "S2B2C利用注文比率",
      consumableGmv: "1件当たり消耗品GMV",
      s2bTake: "S2B2Cプラットフォーム収益率",
      memberConv: "ローカルユーザー会員転換率",
      memberFee: "会員月額",
      douShare: "Dou+有料店舗比率",
      douSpend: "Dou+月額消費／有料店",
      rankingShare: "競価ランキング有料店舗比率",
      rankingSpend: "ランキング月額消費／有料店",
      advertisers: "クリエイター広告主数／年",
      campaigns: "広告主当たり年間キャンペーン数",
      campaignBudget: "1キャンペーン予算",
      campaignTake: "クリエイター撮合手数料率",
      displayArpu: "ディスプレイ広告年間ARPU／MAU",
      hotelOrderShare: "ホテル共同予約注文比率",
      hotelIncome: "ホテル共同予約収入／件",
      hotelPayout: "ホテル共同予約支払／件",
      serverBase: "サーバー・運用固定基盤費／月",
      serverOrder: "クラウド変動費／完了取引",
      serverAccount: "クラウド変動費／稼働アカウント月額",
      rnd: "初期プロダクト開発費／M01のみ",
      nonRndPayroll: "R&D以外の人件費／年",
      marketing: "広告・ブランドプロモーション／年",
      bizdev: "事業開発・店舗オンボーディング／年",
      support: "カスタマーサポート・安全・保険固定費／年",
      admin: "管理・その他費用／年",
      storePattern: "年間新規店獲得配分",
      productivityRamp: "Y1取引生産性ランプ",
      foreignPattern: "外国人ユーザー月次配分",
      fixedCostPattern: "固定費月次配分",
      operations: "1. 月次運営ドライバー",
      plannedStores: "計画稼働店舗数",
      eligibleChurn: "解約可能店舗数",
      churnedStores: "解約店舗数",
      newStores: "新規契約店舗数",
      salesReferralStores: "紹介・営業経由の新規店舗",
      organicStores: "自然流入・口コミの新規店舗",
      adEventStores: "広告・イベント経由の新規店舗",
      activeStores: "稼働店舗数",
      freeStores: "Booking無料期間中店舗数",
      chargeableStores: "Booking課金対象店舗数",
      activeTechs: "稼働セラピスト数",
      churnedTechs: "離脱セラピスト数",
      newTechs: "新規セラピスト数",
      localUsers: "ローカル稼働ユーザー数",
      churnedUsers: "離脱ローカルユーザー数",
      newUsers: "新規ローカルユーザー数",
      foreignMau: "外国人月間ユーザー数",
      totalMau: "総MAU",
      productivity: "取引生産性係数",
      localOrders: "ローカル完了取引数",
      foreignOrders: "外国人完了取引数",
      unmetForeignOrders: "未充足の外国人取引需要",
      totalOrders: "総完了取引数",
      chargeableRatio: "Booking課金対象比率",
      chargeableOrders: "Booking課金対象取引数",
      ekycEnabled: "eKYC稼働フラグ",
      ekycVolume: "eKYC件数",
      revenue: "2. 売上高",
      bookingRevenue: "Bookingプラットフォーム手数料収入",
      storeRevenue: "店舗固定月額収入",
      s2bRevenue: "S2B2Cサプライチェーン収入",
      memberRevenue: "ユーザー会員売上",
      douRevenue: "Dou+短時間トラフィック収入",
      rankingRevenue: "入札型ランキング収入",
      creatorRevenue: "クリエイター広告マッチング収入",
      displayRevenue: "ディスプレイ広告収入",
      hotelRevenue: "ホテル共同予約収入",
      totalRevenue: "売上高合計",
      costs: "3. 運営費用",
      rndCost: "プロダクト開発・R&D費",
      serverFixed: "サーバー固定基盤費",
      serverOrderCost: "サーバー注文連動費",
      serverAccountCost: "サーバーアカウント連動費",
      serverTotal: "サーバー・システム運用費合計",
      payrollCost: "R&D以外の人件費",
      marketingCost: "広告・ブランドプロモーション",
      bizdevCost: "事業開発・店舗オンボーディング",
      supportCost: "カスタマーサポート・安全・保険固定費",
      adminCost: "管理・その他費用",
      successFeeCost: "店舗紹介・営業成功報酬",
      adEventAcquisitionCost: "店舗向け広告・イベント獲得費",
      ekycCost: "eKYC費用",
      riskCost: "履行保険・リスク引当",
      paymentCost: "決済・ポイント精算費",
      userRebateCost: "ユーザー完了取引還元",
      hotelCost: "ホテル共同予約支払",
      totalCosts: "運営費用合計",
      preEkycProfit: "eKYC前営業利益",
      operatingProfit: "営業利益",
      margin: "営業利益率",
      cashSection: "4. キャッシュフロー",
      openingCashLabel: "期首現金",
      endingCash: "期末現金",
      annualSummary: "3カ年主要指標",
      y1Decision: "Y1月次の重要指標",
      status: "モデルステータス",
      check: "チェック項目",
      actual: "実績値",
      expected: "期待値",
      delta: "差異",
      tolerance: "許容差",
      fix: "修正箇所・説明",
      ok: "OK",
      fail: "FAIL",
      pass: "PASS",
      sourceItem: "項目",
      treatment: "モデル上の取扱い",
      source: "出典・根拠",
      versionHistory: "バージョン履歴",
    },
  },
  {
    key: "cn",
    output: "NeeDo_三年财务模型_CN_V2.1_2026-08-22.xlsx",
    sheets: {
      dashboard: "首页仪表盘",
      assumptions: "参数设置",
      engineA: "A_36个月模型",
      engineB: "B_36个月模型",
      y1: "第一年月度PL",
      annual: "三年PL",
      cash: "现金流",
      checks: "检查",
      sources: "口径与来源",
    },
    t: {
      version: "V2.1",
      dashboardTitle: "NeeDo 三年财务模型 V2.1｜36个月渠道及用量驱动模型（中文版）",
      dashboardNote: "更新：2026-08-22｜初期开发费2,000万日元仅计M01｜服务器费为固定25万/月＋订单及账户用量｜拆分店铺获客渠道",
      assumptionsTitle: "参数设置｜可编辑输入（蓝字、黄色单元格）",
      assumptionsNote: "金额除特别注明外均为日元。方案A=保守，方案B=高速增长；计算区全部由公式联动。",
      engineATitle: "方案A（保守）｜36个月经营模型",
      engineBTitle: "方案B（高速增长）｜36个月经营模型",
      engineNote: "逐月计算店铺批次、最低合同期、Booking免费期、用户/技师、服务器费用及eKYC启用条件。金额：日元。",
      y1Title: "第一年月度P&L｜12个月明细（单位：百万日元，人数/订单除外）",
      annualTitle: "三年P&L｜方案对比（单位：百万日元，人数/订单除外）",
      cashTitle: "现金流｜第一年月度及三年汇总（单位：百万日元）",
      checksTitle: "模型检查｜财务、合同、eKYC及服务器费用勾稽",
      sourcesTitle: "模型口径、来源及版本记录",
      scenarioA: "方案A（保守）",
      scenarioB: "方案B（高速增长）",
      parameter: "参数",
      unit: "单位",
      note: "依据/说明",
      y1: "Y1",
      y2: "Y2",
      y3: "Y3",
      month: "月份",
      modelMonth: "模型月",
      sectionPolicy: "一、合同、收费及eKYC政策",
      sectionScale: "二、店铺、技师、用户及交易假设",
      sectionRevenue: "三、其他收入假设",
      sectionCosts: "四、服务器、人力及运营费用假设",
      sectionPattern: "五、月度爬坡及季节分配",
      startMonth: "模型开始月份",
      openingCash: "期初现金",
      financing: "融资（每年首月）",
      ekycEarliest: "eKYC最早启用模型月",
      ekycUserRatio: "eKYC用户覆盖率",
      ekycUnit: "eKYC单价",
      storeFee: "店铺固定月费／店",
      minContract: "店铺最低合同期限",
      successFee: "新签约成功报酬／店",
      successCoverage: "成功报酬适用新店比例",
      salesReferralShare: "介绍及营业渠道占比",
      organicShare: "自然流入及口碑渠道占比",
      adEventShare: "广告及活动渠道占比",
      adEventCac: "广告及活动获店成本／店",
      storeChurn: "最低合同期后月度店铺流失率",
      techChurn: "月度技师流失率",
      userChurn: "月度本地用户流失率",
      bookingFree: "新店Booking免费期",
      bookingFee: "收费Booking平台费／单",
      paymentRate: "支付及点数结算费率",
      riskPerOrder: "履约保险/风险准备／单",
      userRebate: "用户完单返还／单",
      weeksPerMonth: "每月经营周数",
      startingStores: "期初活跃店铺数",
      eoyStores: "期末活跃店铺数",
      techPerStore: "每家活跃店铺技师数",
      usersPerStore: "成熟期每店本地活跃用户数",
      ordersPerTechWeek: "每名技师周均完单数",
      foreignUsers: "年度外国用户数",
      foreignVisits: "每名外国用户年均消费次数",
      capacityPerTechWeek: "每名技师每周订单容量上限",
      s2bShare: "S2B2C采购订单比例",
      consumableGmv: "每单耗材GMV",
      s2bTake: "S2B2C平台收入率",
      memberConv: "本地用户会员转化率",
      memberFee: "用户会员月费",
      douShare: "Dou+付费店铺比例",
      douSpend: "Dou+月均消费／付费店",
      rankingShare: "竞价排名付费店铺比例",
      rankingSpend: "竞价排名月均消费／付费店",
      advertisers: "达人撮合广告主数／年",
      campaigns: "每广告主年均活动次数",
      campaignBudget: "单次活动预算",
      campaignTake: "达人撮合平台抽成率",
      displayArpu: "展示广告年ARPU／MAU",
      hotelOrderShare: "酒店联合预约订单比例",
      hotelIncome: "酒店联合预约收入／单",
      hotelPayout: "酒店联合预约支出／单",
      serverBase: "服务器及运维固定基线／月",
      serverOrder: "云资源变动成本／完单",
      serverAccount: "云资源变动成本／活跃账户月额",
      rnd: "初期产品开发费／仅M01",
      nonRndPayroll: "非研发人员成本／年",
      marketing: "广告及品牌推广／年",
      bizdev: "商务拓展及店铺导入／年",
      support: "客服、安全及保险固定费／年",
      admin: "行政管理及其他费用／年",
      storePattern: "年度新店签约分配",
      productivityRamp: "第一年订单生产率爬坡",
      foreignPattern: "外国用户月度分配",
      fixedCostPattern: "固定费用月度分配",
      operations: "一、月度经营驱动",
      plannedStores: "计划活跃店铺数",
      eligibleChurn: "可流失店铺数",
      churnedStores: "流失店铺数",
      newStores: "新签约店铺数",
      salesReferralStores: "介绍及营业渠道新店",
      organicStores: "自然流入及口碑新店",
      adEventStores: "广告及活动渠道新店",
      activeStores: "活跃店铺数",
      freeStores: "Booking免费期店铺数",
      chargeableStores: "Booking收费店铺数",
      activeTechs: "活跃技师数",
      churnedTechs: "流失技师数",
      newTechs: "新增技师数",
      localUsers: "本地活跃用户数",
      churnedUsers: "流失本地用户数",
      newUsers: "新增本地用户数",
      foreignMau: "外国月活用户数",
      totalMau: "总MAU",
      productivity: "订单生产率系数",
      localOrders: "本地完成订单",
      foreignOrders: "外国用户完成订单",
      unmetForeignOrders: "未满足外国订单需求",
      totalOrders: "总完成订单",
      chargeableRatio: "Booking收费订单比例",
      chargeableOrders: "Booking收费订单",
      ekycEnabled: "eKYC启用标记",
      ekycVolume: "eKYC数量",
      revenue: "二、营业收入",
      bookingRevenue: "Booking平台费收入",
      storeRevenue: "店铺固定月费收入",
      s2bRevenue: "S2B2C供应链收入",
      memberRevenue: "用户会员收入",
      douRevenue: "Dou+短时流量收入",
      rankingRevenue: "竞价排名收入",
      creatorRevenue: "达人广告撮合收入",
      displayRevenue: "展示广告收入",
      hotelRevenue: "酒店联合预约收入",
      totalRevenue: "营业收入合计",
      costs: "三、营业成本及期间费用",
      rndCost: "产品开发及研发费用",
      serverFixed: "服务器固定基线",
      serverOrderCost: "服务器订单变动成本",
      serverAccountCost: "服务器账户变动成本",
      serverTotal: "服务器及系统运维合计",
      payrollCost: "非研发人员成本",
      marketingCost: "广告及品牌推广",
      bizdevCost: "商务拓展及店铺导入",
      supportCost: "客服、安全及保险固定费",
      adminCost: "行政管理及其他费用",
      successFeeCost: "店铺介绍/营业成功报酬",
      adEventAcquisitionCost: "面向店铺的广告及活动获店成本",
      ekycCost: "eKYC费用",
      riskCost: "履约保险/风险准备",
      paymentCost: "支付及点数结算费用",
      userRebateCost: "用户完单返还",
      hotelCost: "酒店联合预约支出",
      totalCosts: "营业费用合计",
      preEkycProfit: "eKYC前营业利润",
      operatingProfit: "营业利润",
      margin: "营业利润率",
      cashSection: "四、现金流",
      openingCashLabel: "期初现金",
      endingCash: "期末现金",
      annualSummary: "三年核心指标",
      y1Decision: "第一年月度关键指标",
      status: "模型状态",
      check: "检查项",
      actual: "实际值",
      expected: "期望值",
      delta: "差异",
      tolerance: "容差",
      fix: "修正位置/说明",
      ok: "OK",
      fail: "FAIL",
      pass: "PASS",
      sourceItem: "项目",
      treatment: "模型处理",
      source: "来源/依据",
      versionHistory: "版本记录",
    },
  },
];

const assumptionRows = {
  startMonth: 6,
  openingCash: 7,
  financing: 8,
  ekycEarliest: 9,
  ekycUserRatio: 10,
  ekycUnit: 11,
  storeFee: 12,
  minContract: 13,
  successFee: 14,
  successCoverage: 15,
  salesReferralShare: 16,
  organicShare: 17,
  adEventShare: 18,
  adEventCac: 19,
  storeChurn: 20,
  techChurn: 21,
  userChurn: 22,
  bookingFree: 23,
  bookingFee: 24,
  paymentRate: 25,
  riskPerOrder: 26,
  userRebate: 27,
  weeksPerMonth: 28,
  startingStores: 29,
  eoyStores: 35,
  techPerStore: 36,
  usersPerStore: 37,
  ordersPerTechWeek: 38,
  foreignUsers: 39,
  foreignVisits: 40,
  capacityPerTechWeek: 41,
  s2bShare: 44,
  consumableGmv: 45,
  s2bTake: 46,
  memberConv: 47,
  memberFee: 48,
  douShare: 49,
  douSpend: 50,
  rankingShare: 51,
  rankingSpend: 52,
  advertisers: 53,
  campaigns: 54,
  campaignBudget: 55,
  campaignTake: 56,
  displayArpu: 57,
  hotelOrderShare: 58,
  hotelIncome: 59,
  hotelPayout: 60,
  serverBase: 64,
  serverOrder: 65,
  serverAccount: 66,
  rnd: 67,
  nonRndPayroll: 68,
  marketing: 69,
  bizdev: 70,
  support: 71,
  admin: 72,
  storePattern: 76,
  productivityRamp: 77,
  foreignPattern: 78,
  fixedCostPattern: 79,
};

const engineRows = {
  plannedStores: 10,
  eligibleChurn: 11,
  churnedStores: 12,
  newStores: 13,
  salesReferralStores: 14,
  organicStores: 15,
  adEventStores: 16,
  activeStores: 17,
  freeStores: 18,
  chargeableStores: 19,
  activeTechs: 20,
  churnedTechs: 21,
  newTechs: 22,
  localUsers: 23,
  churnedUsers: 24,
  newUsers: 25,
  foreignMau: 26,
  totalMau: 27,
  productivity: 28,
  localOrders: 29,
  foreignOrders: 30,
  totalOrders: 31,
  chargeableRatio: 32,
  chargeableOrders: 33,
  ekycEnabled: 34,
  ekycVolume: 35,
  unmetForeignOrders: 36,
  bookingRevenue: 38,
  storeRevenue: 39,
  s2bRevenue: 40,
  memberRevenue: 41,
  douRevenue: 42,
  rankingRevenue: 43,
  creatorRevenue: 44,
  displayRevenue: 45,
  hotelRevenue: 46,
  totalRevenue: 47,
  rndCost: 50,
  serverFixed: 51,
  serverOrderCost: 52,
  serverAccountCost: 53,
  serverTotal: 54,
  payrollCost: 55,
  marketingCost: 56,
  bizdevCost: 57,
  supportCost: 58,
  adminCost: 59,
  successFeeCost: 60,
  adEventAcquisitionCost: 61,
  ekycCost: 62,
  riskCost: 63,
  paymentCost: 64,
  userRebateCost: 65,
  hotelCost: 66,
  totalCosts: 67,
  preEkycProfit: 68,
  operatingProfit: 69,
  margin: 70,
  financing: 73,
  openingCash: 74,
  endingCash: 75,
};

function colName(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function mergeWrite(sheet, address, value) {
  const range = sheet.getRange(address);
  range.merge();
  range.values = [[value]];
  return range;
}

function titleBand(sheet, address, value) {
  const range = mergeWrite(sheet, address, value);
  range.format = {
    fill: colors.navy,
    font: { color: colors.white, bold: true, size: 18 },
    verticalAlignment: "center",
  };
  range.format.rowHeight = 32;
}

function noteBand(sheet, address, value) {
  const range = mergeWrite(sheet, address, value);
  range.format = {
    fill: colors.paleBlue,
    font: { color: "#35546C", size: 10 },
    verticalAlignment: "center",
    wrapText: true,
  };
  range.format.rowHeight = 30;
}

function sectionBand(sheet, address, value) {
  const range = mergeWrite(sheet, address, value);
  range.format = {
    fill: colors.darkNavy,
    font: { color: colors.white, bold: true, size: 11 },
    verticalAlignment: "center",
  };
  range.format.rowHeight = 22;
}

function headerStyle(range) {
  range.format = {
    fill: colors.blue,
    font: { color: colors.white, bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.border },
  };
  range.format.rowHeight = 28;
}

function bodyBorders(range) {
  range.format.borders = { preset: "all", style: "thin", color: colors.border };
}

function styleTotal(sheet, address) {
  const range = sheet.getRange(address);
  range.format.font = { bold: true, color: colors.black };
  range.format.fill = colors.lightBlue;
  range.format.borders = { top: { style: "double", color: colors.navy } };
}

function styleInput(range, numberFormat = fmt.raw) {
  range.format.fill = colors.input;
  range.format.font = { color: colors.inputBlue };
  range.format.numberFormat = numberFormat;
}

function scenarioCell(scenario, year, row) {
  const base = scenario === "A" ? 2 : 5;
  return `${colName(base + year - 1)}${row}`;
}

function assumptionFormula(sheetName, scenario, year, row) {
  return `'${sheetName}'!$${scenarioCell(scenario, year, row).replace(/([A-Z]+)(\d+)/, "$1$$$2")}`;
}

function assumptionRef(sheetName, scenario, year, row) {
  const cell = scenarioCell(scenario, year, row);
  const match = cell.match(/([A-Z]+)(\d+)/);
  return `'${sheetName}'!$${match[1]}$${match[2]}`;
}

function buildAssumptions(workbook, sheet, config) {
  const { t } = config;
  titleBand(sheet, "A1:I1", t.assumptionsTitle);
  noteBand(sheet, "A2:I2", t.assumptionsNote);
  sectionBand(sheet, "A4:I4", t.sectionPolicy);
  sheet.getRange("A5:I5").values = [[
    t.parameter, t.unit, `${t.scenarioA} ${t.y1}`, `${t.scenarioA} ${t.y2}`, `${t.scenarioA} ${t.y3}`,
    `${t.scenarioB} ${t.y1}`, `${t.scenarioB} ${t.y2}`, `${t.scenarioB} ${t.y3}`, t.note,
  ]];
  headerStyle(sheet.getRange("A5:I5"));

  const start = new Date(Date.UTC(2026, 8, 1));
  const policyRows = [
    [t.startMonth, "date", start, start, start, start, start, start, config.key === "jp" ? "入力値。必要に応じて開始月を変更" : "输入值，可按实际计划修改开始月份"],
    [t.openingCash, "JPY", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "モデル開始前の現金残高" : "模型开始前现金余额"],
    [t.financing, "JPY", 200000000, 0, 0, 200000000, 0, 0, config.key === "jp" ? "各年の初月に計上。Y1は2億円、Y2/Y3は0" : "在各年首月计入；Y1为2亿日元，Y2/Y3为0"],
    [t.ekycEarliest, "month", 7, 7, 7, 7, 7, 7, config.key === "jp" ? "最初の6か月はeKYCを使用しない。7は最短開始月で、利益条件も必要" : "前6个月不使用eKYC；7为最早月份，且仍须满足利润条件"],
    [t.ekycUserRatio, "%", 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, config.key === "jp" ? "新規ユーザーのうち本人確認対象となる比率" : "新增用户中需要身份认证的比例"],
    [t.ekycUnit, "JPY/case", 300, 300, 300, 300, 300, 300, config.key === "jp" ? "eKYC開始後に新規店舗管理者・技師・対象ユーザーへ適用" : "eKYC启用后适用于新店管理员、技师及覆盖用户"],
    [t.storeFee, "JPY/store/month", 9800, 9800, 9800, 9800, 9800, 9800, config.key === "jp" ? "契約開始月から月次認識。Booking無料期間とは分離" : "自合同开始月按月确认，与Booking免费期分开"],
    [t.minContract, "month", 6, 6, 6, 6, 6, 6, config.key === "jp" ? "6か月分の前受金は想定しない。6か月以内の解約なし" : "不按6个月预收；6个月内不发生店铺流失"],
    [t.successFee, "JPY/new store", 30000, 30000, 30000, 30000, 30000, 30000, config.key === "jp" ? "中介または営業へ、新規契約成立ごとに1回支払う" : "每成功签约一家店铺，向中介或营业支付一次"],
    [t.successCoverage, "%", 1, 1, 1, 1, 1, 1, config.key === "jp" ? "紹介・営業経由店舗のうち成功報酬を支払う比率" : "介绍及营业渠道新店中支付成功报酬的比例"],
    [t.salesReferralShare, "%", 0.65, 0.45, 0.30, 0.35, 0.12, 0.08, config.key === "jp" ? "営業・中介依存は年々低下。30,000円成功報酬の対象チャネル" : "营业及中介依赖逐年下降；该渠道适用30,000日元成功报酬"],
    [t.organicShare, "%", 0.15, 0.30, 0.45, 0.30, 0.55, 0.65, config.key === "jp" ? "口コミ、店舗間紹介、検索・ブランド指名による自然流入" : "口碑、店铺间推荐、搜索及品牌指名带来的自然流入"],
    [t.adEventShare, "%", 0.20, 0.25, 0.25, 0.35, 0.33, 0.27, config.key === "jp" ? "広告、キャンペーン、イベント、アライアンス経由" : "广告、营销活动、线下活动及联盟渠道"],
    [t.adEventCac, "JPY/new store", 15000, 15000, 15000, 15000, 15000, 15000, config.key === "jp" ? "広告・イベント経由の獲得店舗に対するB2B変動獲得費（管理仮定）" : "广告及活动渠道每家新店的B2B变动获客成本（管理假设）"],
    [t.storeChurn, "%/month", 0.01, 0.01, 0.01, 0.008, 0.008, 0.008, config.key === "jp" ? "最低契約期間終了後の月次解約率（仮定）" : "最低合同期结束后的月度流失率（假设）"],
    [t.techChurn, "%/month", 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, config.key === "jp" ? "稼働技師の月次入替（新規採用で補充）" : "活跃技师月度流失，由新增技师补充"],
    [t.userChurn, "%/month", 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, config.key === "jp" ? "ローカルMAUの月次離脱（新規獲得で補充）" : "本地MAU月度流失，由新增用户补充"],
    [t.bookingFree, "month", 3, 3, 3, 3, 3, 3, config.key === "jp" ? "新規店は最初の3か月のみBooking手数料無料" : "新店最初3个月仅免Booking平台费"],
    [t.bookingFee, "JPY/order", 500, 500, 500, 500, 500, 500, config.key === "jp" ? "無料期間終了後の課金対象取引に適用" : "适用于免费期结束后的收费订单"],
    [t.paymentRate, "%", 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, config.key === "jp" ? "主要な課金収入に対する決済・精算費" : "对主要收费收入计提支付及结算费"],
    [t.riskPerOrder, "JPY/order", 30, 30, 30, 30, 30, 30, config.key === "jp" ? "すべての完了取引に連動" : "按全部完成订单计提"],
    [t.userRebate, "JPY/order", 100, 100, 100, 100, 100, 100, config.key === "jp" ? "完了取引ごとに100 NDP相当を還元" : "每笔完成订单返还100 NDP等值"],
    [t.weeksPerMonth, "week/month", 4, 4, 4, 4, 4, 4, config.key === "jp" ? "年間48週を月4週でモデル化" : "全年48周，按每月4周建模"],
    [t.startingStores, "store", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "既存稼働店がある場合は入力" : "如模型开始时已有活跃店铺，可在此输入"],
  ];
  sheet.getRange("A6:I29").values = policyRows;

  sectionBand(sheet, "A33:I33", t.sectionScale);
  sheet.getRange("A34:I34").values = [sheet.getRange("A5:I5").values[0]];
  headerStyle(sheet.getRange("A34:I34"));
  const scaleRows = [
    [t.eoyStores, "store", 500, 1000, 2000, 1200, 3000, 6000, config.key === "jp" ? "Aは検証的拡大。BはPMF・広告・アライアンス成立を前提に加速（市場上限とは別）" : "A为验证式扩张；B以形成PMF、广告及联盟渠道有效为前提加速（不等同市场上限）"],
    [t.techPerStore, "person/store", 10, 10, 10, 10, 10, 10, config.key === "jp" ? "店舗数に応じて月次で増減" : "随店铺数逐月变化"],
    [t.usersPerStore, "MAU/store", 100, 100, 100, 100, 100, 100, config.key === "jp" ? "成熟時のローカルMAU。離脱と新規獲得を別表示" : "成熟期本地MAU；单独显示流失与新增"],
    [t.ordersPerTechWeek, "order/person/week", 1, 1, 1, 2, 2, 2, config.key === "jp" ? "Y1は生産性ランプを追加適用" : "第一年另乘订单生产率爬坡"],
    [t.foreignUsers, "user/year", 22836, 48868, 104578, 228357, 488685, 1045785, config.key === "jp" ? "V1.5の訪日外国人ユーザー前提を継承" : "沿用V1.5外国用户假设"],
    [t.foreignVisits, "order/user/year", 1, 1, 1, 2, 2, 2, config.key === "jp" ? "年間利用回数を月次季節配分" : "年度消费次数按月度季节分配"],
    [t.capacityPerTechWeek, "order/person/week", 5, 5, 5, 5, 5, 5, config.key === "jp" ? "外国人取引を含む総取引の運営上限。超過需要は未充足として表示" : "包含外国订单的总履约上限；超出部分列为未满足需求"],
  ];
  sheet.getRange("A35:I41").values = scaleRows;

  sectionBand(sheet, "A42:I42", t.sectionRevenue);
  sheet.getRange("A43:I43").values = [sheet.getRange("A5:I5").values[0]];
  headerStyle(sheet.getRange("A43:I43"));
  const revenueRows = [
    [t.s2bShare, "%", 0, 0.5, 0.5, 0, 0.5, 0.5, config.key === "jp" ? "Y2以降、完了取引の50%で消耗品調達" : "Y2起，50%的完单通过平台采购耗材"],
    [t.consumableGmv, "JPY/order", 250, 250, 250, 250, 250, 250, config.key === "jp" ? "管理仮定" : "管理假设"],
    [t.s2bTake, "%", 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, config.key === "jp" ? "プラットフォームがGMVの10%を売上認識" : "平台确认GMV的10%为收入"],
    [t.memberConv, "%", 0, 0.015, 0.03, 0, 0.03, 0.05, config.key === "jp" ? "Y2以降の有料会員転換" : "Y2起的付费会员转化"],
    [t.memberFee, "JPY/user/month", 980, 980, 980, 980, 980, 980, config.key === "jp" ? "月次課金" : "按月收费"],
    [t.douShare, "%", 0, 0.05, 0.08, 0, 0.1, 0.18, config.key === "jp" ? "Booking課金対象店舗に適用" : "适用于Booking收费店铺"],
    [t.douSpend, "JPY/store/month", 0, 10000, 15000, 0, 15000, 25000, config.key === "jp" ? "月額平均消費" : "月均消费"],
    [t.rankingShare, "%", 0, 0, 0.08, 0, 0, 0.2, config.key === "jp" ? "Y3から開始" : "Y3上线"],
    [t.rankingSpend, "JPY/store/month", 0, 0, 20000, 0, 0, 30000, config.key === "jp" ? "Y3の月額平均消費" : "Y3月均消费"],
    [t.advertisers, "advertiser/year", 0, 0, 30, 0, 0, 120, config.key === "jp" ? "Y3から開始" : "Y3上线"],
    [t.campaigns, "campaign/year", 0, 0, 3, 0, 0, 6, config.key === "jp" ? "広告主当たり" : "每广告主"],
    [t.campaignBudget, "JPY/campaign", 0, 0, 300000, 0, 0, 500000, config.key === "jp" ? "キャンペーン予算" : "活动预算"],
    [t.campaignTake, "%", 0, 0, 0.1, 0, 0, 0.1, config.key === "jp" ? "プラットフォーム手数料" : "平台抽成"],
    [t.displayArpu, "JPY/MAU/year", 0, 0, 150, 0, 0, 300, config.key === "jp" ? "Y3から開始" : "Y3上线"],
    [t.hotelOrderShare, "%", 0, 0, 0, 0, 0.1, 0.1, config.key === "jp" ? "高成長シナリオY2から" : "高速增长方案Y2起"],
    [t.hotelIncome, "JPY/order", 500, 500, 500, 500, 500, 500, config.key === "jp" ? "共同予約による収入" : "联合预约收入"],
    [t.hotelPayout, "JPY/order", 500, 500, 500, 500, 500, 500, config.key === "jp" ? "ホテル/住処パートナーへの支払" : "支付给酒店/住处合作方"],
  ];
  sheet.getRange("A44:I60").values = revenueRows;

  sectionBand(sheet, "A62:I62", t.sectionCosts);
  sheet.getRange("A63:I63").values = [sheet.getRange("A5:I5").values[0]];
  headerStyle(sheet.getRange("A63:I63"));
  const costRows = [
    [t.serverBase, "JPY/month", 250000, 250000, 250000, 250000, 250000, 250000, config.key === "jp" ? "リーン初期構成の固定基盤。高可用化・個別専有環境は別途上振れ" : "精益型初期架构固定基线；如采用更高可用或独占环境需另行上调"],
    [t.serverOrder, "JPY/order", 15, 15, 15, 15, 15, 15, config.key === "jp" ? "API、通知、ログ、キュー等。完了取引数に比例" : "API、通知、日志及队列等，随完成订单数增加"],
    [t.serverAccount, "JPY/account/month", 10, 10, 10, 10, 10, 10, config.key === "jp" ? "店舗・技師・MAUの保存、検索、配信等。稼働アカウントに比例" : "店铺、技师及MAU的存储、搜索及推送，随活跃账户增加"],
    [t.rnd, "JPY/once", 20000000, 0, 0, 20000000, 0, 0, config.key === "jp" ? "ユーザー指定：初期開発費2,000万円をモデルM01に一括計上" : "用户指定：初期开发费2,000万日元仅在模型M01一次性计入"],
    [t.nonRndPayroll, "JPY/year", 12000000, 22000000, 45000000, 35000000, 65000000, 95000000, config.key === "jp" ? "R&D以外の人件費" : "不含研发的人力成本"],
    [t.marketing, "JPY/year", 6000000, 12000000, 24000000, 36000000, 72000000, 144000000, config.key === "jp" ? "消費者向けブランド・需要喚起。店舗向け獲得費は別科目" : "面向用户的品牌及需求激活费用；面向店铺的获客成本单独列示"],
    [t.bizdev, "JPY/year", 5000000, 10000000, 22000000, 18000000, 36000000, 72000000, config.key === "jp" ? "チャネル開拓、提携、店舗導入支援" : "渠道拓展、合作联盟及店铺上线支持"],
    [t.support, "JPY/year", 4000000, 7000000, 20000000, 12000000, 30000000, 70000000, config.key === "jp" ? "CS、安全、固定保険。利用規模に応じて増額" : "客服、安全及固定保险，随使用规模增加"],
    [t.admin, "JPY/year", 5000000, 9000000, 24000000, 12000000, 24000000, 45000000, config.key === "jp" ? "財税、法務、オフィス、共通ソフト等" : "财税、法务、办公及通用软件等"],
  ];
  sheet.getRange("A64:I72").values = costRows;

  sectionBand(sheet, "A74:N74", t.sectionPattern);
  sheet.getRange("A75:N75").values = [[t.parameter, t.unit, ...Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`)]];
  headerStyle(sheet.getRange("A75:N75"));
  const storePattern = [0.025, 0.03, 0.04, 0.055, 0.07, 0.085, 0.10, 0.11, 0.115, 0.12, 0.125, 0.125];
  const productivity = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.00];
  const foreignPattern = [0.07, 0.07, 0.08, 0.08, 0.09, 0.09, 0.09, 0.09, 0.08, 0.08, 0.09, 0.09];
  const fixedPattern = Array(12).fill(1 / 12);
  sheet.getRange("A76:N79").values = [
    [t.storePattern, "%", ...storePattern],
    [t.productivityRamp, "%", ...productivity],
    [t.foreignPattern, "%", ...foreignPattern],
    [t.fixedCostPattern, "%", ...fixedPattern],
  ];
  sheet.getRange("A80:B83").values = [
    [config.key === "jp" ? "獲得配分合計" : "签约分配合计", "%"],
    [config.key === "jp" ? "外国人配分合計" : "外国用户分配合计", "%"],
    [config.key === "jp" ? "固定費配分合計" : "固定费用分配合计", "%"],
    [config.key === "jp" ? "eKYC開始ロジック" : "eKYC启用逻辑", "text"],
  ];
  sheet.getRange("C80").formulas = [["=SUM(C76:N76)"]];
  sheet.getRange("C81").formulas = [["=SUM(C78:N78)"]];
  sheet.getRange("C82").formulas = [["=SUM(C79:N79)"]];
  sheet.getRange("C83:N83").merge();
  sheet.getRange("C83").values = [[config.key === "jp"
    ? "最短開始月以降、前月のeKYC前営業利益がプラスになった翌月から開始。開始後は継続。"
    : "达到最早启用月后，仅在上月eKYC前营业利润为正时于次月启用；启用后持续。"]];

  const inputBlocks = ["C6:H29", "C35:H41", "C44:H60", "C64:H72", "C76:N79"];
  for (const address of inputBlocks) styleInput(sheet.getRange(address));
  sheet.getRange("C6:H6").format.numberFormat = fmt.date;
  for (const row of [10, 15, 16, 17, 18, 20, 21, 22, 25, 44, 46, 47, 49, 51, 56, 58]) {
    sheet.getRange(`C${row}:H${row}`).format.numberFormat = fmt.pct;
  }
  sheet.getRange("C76:N79").format.numberFormat = fmt.pct;
  sheet.getRange("C80:C82").format.numberFormat = fmt.pct;
  sheet.getRange("C80:C82").format.font = { color: colors.black, bold: true };

  bodyBorders(sheet.getRange("A6:I29"));
  bodyBorders(sheet.getRange("A35:I41"));
  bodyBorders(sheet.getRange("A44:I60"));
  bodyBorders(sheet.getRange("A64:I72"));
  bodyBorders(sheet.getRange("A76:N83"));
  sheet.getRange("A6:A83").format.wrapText = true;
  sheet.getRange("I6:I72").format.wrapText = true;
  sheet.getRange("A1:N83").format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.getRange("A:A").format.columnWidth = 34;
  sheet.getRange("B:B").format.columnWidth = 18;
  sheet.getRange("C:H").format.columnWidth = 14;
  sheet.getRange("I:I").format.columnWidth = 54;
  sheet.getRange("J:N").format.columnWidth = 12;
  sheet.freezePanes.freezeRows(5);
  sheet.freezePanes.freezeColumns(2);
  sheet.showGridLines = false;

  workbook.comments.addThread({ cell: sheet.getRange("C12") }, config.key === "jp"
    ? "ユーザー指定（2026-08-21）：全店舗から月額9,800円。契約開始月から月次で認識。"
    : "用户要求（2026-08-21）：每家店铺月费9,800日元，自合同开始月按月确认。");
  workbook.comments.addThread({ cell: sheet.getRange("C13") }, config.key === "jp"
    ? "ユーザー指定（2026-08-21）：最低契約期間6か月。6か月分の前受金は想定しない。"
    : "用户要求（2026-08-21）：最低合同期6个月，不按6个月一次性预收。");
  workbook.comments.addThread({ cell: sheet.getRange("C14") }, config.key === "jp"
    ? "ユーザー指定（2026-08-21）：中介または営業に新規店1店の契約成立ごとに30,000円。"
    : "用户要求（2026-08-21）：中介或营业每成功签约一家新店支付30,000日元。");
  workbook.comments.addThread({ cell: sheet.getRange("C9") }, config.key === "jp"
    ? "少なくとも前半6か月はeKYCを使わず、eKYC前営業利益がプラスになった翌月から開始。"
    : "至少前6个月不使用eKYC；仅在eKYC前营业利润转正后的次月启用。");
  workbook.comments.addThread({ cell: sheet.getRange("C64") }, config.key === "jp"
    ? "2026-08-22見直し：初期の固定サーバー基盤は月25万円。AWS等の従量課金を前提に、注文数と稼働アカウント数で増加。"
    : "2026-08-22调整：初期服务器固定基线为每月25万日元；按云服务用量模式，随订单数和活跃账户数增加。");
  workbook.comments.addThread({ cell: sheet.getRange("C67") }, config.key === "jp"
    ? "ユーザー指定（2026-08-22）：初期開発費2,000万円はM01のみに一括計上し、以後は0。"
    : "用户指定（2026-08-22）：初期开发费2,000万日元仅在M01一次性计入，之后为0。");
  workbook.comments.addThread({ cell: sheet.getRange("F35") }, config.key === "jp"
    ? "高成長シナリオはY1 1,200店、Y2 3,000店、Y3 6,000店。PMF、広告、イベント、提携が機能する条件付き上振れケース。"
    : "高速增长方案为Y1 1,200家、Y2 3,000家、Y3 6,000家；属于形成PMF且广告、活动及联盟渠道有效的条件性上行情景。");
}

function buildEngine(sheet, config, scenario) {
  const { t, sheets } = config;
  const title = scenario === "A" ? t.engineATitle : t.engineBTitle;
  titleBand(sheet, "A1:AL1", title);
  noteBand(sheet, "A2:AL2", t.engineNote);
  sheet.getRange("A4:B8").values = [
    [t.month, t.unit],
    [t.modelMonth, "text"],
    [config.key === "jp" ? "年度" : "年度", "year"],
    [config.key === "jp" ? "年内月" : "年内月", "month"],
    [config.key === "jp" ? "通算月" : "累计月", "month"],
  ];
  headerStyle(sheet.getRange("A4:AL4"));
  sheet.getRange("A5:B8").format.fill = colors.paleBlue;
  sheet.getRange("A5:A8").format.font = { bold: true };

  const monthCols = Array.from({ length: 36 }, (_, i) => colName(i + 2));
  sheet.getRange("C4:AL4").formulas = [[...monthCols.map((_, i) => `=DATE(YEAR('${sheets.assumptions}'!$C$6),MONTH('${sheets.assumptions}'!$C$6)+${i},1)`)]];
  sheet.getRange("C4:AL4").format.numberFormat = fmt.date;
  sheet.getRange("C5:AL5").values = [[...monthCols.map((_, i) => `Y${Math.floor(i / 12) + 1}-M${String((i % 12) + 1).padStart(2, "0")}`)]];
  sheet.getRange("C6:AL6").values = [[...monthCols.map((_, i) => Math.floor(i / 12) + 1)]];
  sheet.getRange("C7:AL7").values = [[...monthCols.map((_, i) => (i % 12) + 1)]];
  sheet.getRange("C8:AL8").values = [[...monthCols.map((_, i) => i + 1)]];
  sheet.getRange("C5:AL8").format.horizontalAlignment = "center";

  sectionBand(sheet, "A9:AL9", t.operations);
  const driverLabels = [
    [t.plannedStores, "store"], [t.eligibleChurn, "store"], [t.churnedStores, "store"], [t.newStores, "store"],
    [t.salesReferralStores, "store"], [t.organicStores, "store"], [t.adEventStores, "store"],
    [t.activeStores, "store"], [t.freeStores, "store"], [t.chargeableStores, "store"], [t.activeTechs, "person"],
    [t.churnedTechs, "person"], [t.newTechs, "person"], [t.localUsers, "MAU"], [t.churnedUsers, "MAU"],
    [t.newUsers, "MAU"], [t.foreignMau, "MAU"], [t.totalMau, "MAU"], [t.productivity, "%"],
    [t.localOrders, "order"], [t.foreignOrders, "order"], [t.totalOrders, "order"], [t.chargeableRatio, "%"],
    [t.chargeableOrders, "order"], [t.ekycEnabled, "0/1"], [t.ekycVolume, "case"],
  ];
  sheet.getRange("A10:B35").values = driverLabels;
  sheet.getRange("A36:B36").values = [[t.unmetForeignOrders, "order"]];
  sectionBand(sheet, "A37:AL37", t.revenue);
  const revenueLabels = [
    [t.bookingRevenue, "JPY"], [t.storeRevenue, "JPY"], [t.s2bRevenue, "JPY"], [t.memberRevenue, "JPY"],
    [t.douRevenue, "JPY"], [t.rankingRevenue, "JPY"], [t.creatorRevenue, "JPY"], [t.displayRevenue, "JPY"],
    [t.hotelRevenue, "JPY"], [t.totalRevenue, "JPY"],
  ];
  sheet.getRange("A38:B47").values = revenueLabels;
  sectionBand(sheet, "A49:AL49", t.costs);
  const costLabels = [
    [t.rndCost, "JPY"], [t.serverFixed, "JPY"], [t.serverOrderCost, "JPY"], [t.serverAccountCost, "JPY"], [t.serverTotal, "JPY"],
    [t.payrollCost, "JPY"], [t.marketingCost, "JPY"], [t.bizdevCost, "JPY"], [t.supportCost, "JPY"], [t.adminCost, "JPY"],
    [t.successFeeCost, "JPY"], [t.adEventAcquisitionCost, "JPY"], [t.ekycCost, "JPY"], [t.riskCost, "JPY"], [t.paymentCost, "JPY"], [t.userRebateCost, "JPY"],
    [t.hotelCost, "JPY"], [t.totalCosts, "JPY"], [t.preEkycProfit, "JPY"], [t.operatingProfit, "JPY"], [t.margin, "%"],
  ];
  sheet.getRange("A50:B70").values = costLabels;
  sectionBand(sheet, "A72:AL72", t.cashSection);
  sheet.getRange("A73:B75").values = [[t.financing, "JPY"], [t.openingCashLabel, "JPY"], [t.endingCash, "JPY"]];

  for (let i = 0; i < 36; i++) {
    const col = colName(i + 2);
    const year = Math.floor(i / 12) + 1;
    const monthInYear = (i % 12) + 1;
    const patternCol = colName(2 + monthInYear - 1);
    const currentTarget = assumptionRef(sheets.assumptions, scenario, year, assumptionRows.eoyStores);
    const priorTarget = year === 1
      ? assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.startingStores)
      : assumptionRef(sheets.assumptions, scenario, year - 1, assumptionRows.eoyStores);
    const prevCol = i === 0 ? null : colName(i + 1);
    const prevActive = i === 0
      ? assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.startingStores)
      : `${prevCol}${engineRows.activeStores}`;
    const prevTech = i === 0 ? "0" : `${prevCol}${engineRows.activeTechs}`;
    const prevUsers = i === 0 ? "0" : `${prevCol}${engineRows.localUsers}`;

    sheet.getRange(`${col}${engineRows.plannedStores}`).formulas = [[`=${priorTarget}+(${currentTarget}-${priorTarget})*SUM('${sheets.assumptions}'!$C$${assumptionRows.storePattern}:'${sheets.assumptions}'!$${patternCol}$${assumptionRows.storePattern})`]];
    if (i === 0) {
      sheet.getRange(`${col}${engineRows.eligibleChurn}`).formulas = [["=0"]];
    } else {
      sheet.getRange(`${col}${engineRows.eligibleChurn}`).formulas = [[`=IF(${col}$8<=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.minContract)},0,MAX(0,${prevActive}-SUMIFS($C$${engineRows.newStores}:${prevCol}$${engineRows.newStores},$C$8:${prevCol}$8,">"&${col}$8-${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.minContract)})))`]];
    }
    sheet.getRange(`${col}${engineRows.churnedStores}`).formulas = [[`=${col}${engineRows.eligibleChurn}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.storeChurn)}`]];
    sheet.getRange(`${col}${engineRows.newStores}`).formulas = [[`=MAX(0,${col}${engineRows.plannedStores}-${prevActive}+${col}${engineRows.churnedStores})`]];
    sheet.getRange(`${col}${engineRows.salesReferralStores}`).formulas = [[`=${col}${engineRows.newStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.salesReferralShare)}`]];
    sheet.getRange(`${col}${engineRows.organicStores}`).formulas = [[`=${col}${engineRows.newStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.organicShare)}`]];
    sheet.getRange(`${col}${engineRows.adEventStores}`).formulas = [[`=${col}${engineRows.newStores}-${col}${engineRows.salesReferralStores}-${col}${engineRows.organicStores}`]];
    sheet.getRange(`${col}${engineRows.activeStores}`).formulas = [[`=${prevActive}+${col}${engineRows.newStores}-${col}${engineRows.churnedStores}`]];
    sheet.getRange(`${col}${engineRows.freeStores}`).formulas = [[`=SUMIFS($C$${engineRows.newStores}:${col}$${engineRows.newStores},$C$8:${col}$8,">"&${col}$8-${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.bookingFree)},$C$8:${col}$8,"<="&${col}$8)`]];
    sheet.getRange(`${col}${engineRows.chargeableStores}`).formulas = [[`=MAX(0,${col}${engineRows.activeStores}-${col}${engineRows.freeStores})`]];
    sheet.getRange(`${col}${engineRows.activeTechs}`).formulas = [[`=${col}${engineRows.activeStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.techPerStore)}`]];
    sheet.getRange(`${col}${engineRows.churnedTechs}`).formulas = [[`=${prevTech}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.techChurn)}`]];
    sheet.getRange(`${col}${engineRows.newTechs}`).formulas = [[`=MAX(0,${col}${engineRows.activeTechs}-${prevTech}+${col}${engineRows.churnedTechs})`]];
    sheet.getRange(`${col}${engineRows.localUsers}`).formulas = [[`=${col}${engineRows.activeStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.usersPerStore)}`]];
    sheet.getRange(`${col}${engineRows.churnedUsers}`).formulas = [[`=${prevUsers}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.userChurn)}`]];
    sheet.getRange(`${col}${engineRows.newUsers}`).formulas = [[`=MAX(0,${col}${engineRows.localUsers}-${prevUsers}+${col}${engineRows.churnedUsers})`]];
    sheet.getRange(`${col}${engineRows.foreignMau}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignUsers)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.foreignPattern}`]];
    sheet.getRange(`${col}${engineRows.totalMau}`).formulas = [[`=${col}${engineRows.localUsers}+${col}${engineRows.foreignMau}`]];
    sheet.getRange(`${col}${engineRows.productivity}`).formulas = [[year === 1 ? `='${sheets.assumptions}'!$${patternCol}$${assumptionRows.productivityRamp}` : "=1"]];
    sheet.getRange(`${col}${engineRows.localOrders}`).formulas = [[`=${col}${engineRows.activeTechs}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ordersPerTechWeek)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.weeksPerMonth)}*${col}${engineRows.productivity}`]];
    sheet.getRange(`${col}${engineRows.foreignOrders}`).formulas = [[`=MIN(${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignUsers)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignVisits)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.foreignPattern},MAX(0,${col}${engineRows.activeTechs}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.capacityPerTechWeek)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.weeksPerMonth)}-${col}${engineRows.localOrders}))`]];
    sheet.getRange(`${col}${engineRows.totalOrders}`).formulas = [[`=${col}${engineRows.localOrders}+${col}${engineRows.foreignOrders}`]];
    sheet.getRange(`${col}${engineRows.chargeableRatio}`).formulas = [[`=IF(${col}${engineRows.activeStores}=0,0,${col}${engineRows.chargeableStores}/${col}${engineRows.activeStores})`]];
    sheet.getRange(`${col}${engineRows.chargeableOrders}`).formulas = [[`=${col}${engineRows.totalOrders}*${col}${engineRows.chargeableRatio}`]];
    if (i === 0) {
      sheet.getRange(`${col}${engineRows.ekycEnabled}`).formulas = [["=0"]];
    } else {
      sheet.getRange(`${col}${engineRows.ekycEnabled}`).formulas = [[`=IF(${col}$8<${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ekycEarliest)},0,IF(${prevCol}${engineRows.ekycEnabled}=1,1,IF(${prevCol}${engineRows.preEkycProfit}>0,1,0)))`]];
    }
    sheet.getRange(`${col}${engineRows.ekycVolume}`).formulas = [[`=${col}${engineRows.ekycEnabled}*(${col}${engineRows.newStores}+${col}${engineRows.newTechs}+(${col}${engineRows.newUsers}+${col}${engineRows.foreignMau})*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ekycUserRatio)})`]];
    sheet.getRange(`${col}${engineRows.unmetForeignOrders}`).formulas = [[`=MAX(0,${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignUsers)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignVisits)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.foreignPattern}-${col}${engineRows.foreignOrders})`]];

    sheet.getRange(`${col}${engineRows.bookingRevenue}`).formulas = [[`=${col}${engineRows.chargeableOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.bookingFee)}`]];
    sheet.getRange(`${col}${engineRows.storeRevenue}`).formulas = [[`=${col}${engineRows.activeStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.storeFee)}`]];
    sheet.getRange(`${col}${engineRows.s2bRevenue}`).formulas = [[`=${col}${engineRows.totalOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.s2bShare)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.consumableGmv)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.s2bTake)}`]];
    sheet.getRange(`${col}${engineRows.memberRevenue}`).formulas = [[`=${col}${engineRows.localUsers}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.memberConv)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.memberFee)}`]];
    sheet.getRange(`${col}${engineRows.douRevenue}`).formulas = [[`=${col}${engineRows.chargeableStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.douShare)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.douSpend)}`]];
    sheet.getRange(`${col}${engineRows.rankingRevenue}`).formulas = [[`=${col}${engineRows.chargeableStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rankingShare)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rankingSpend)}`]];
    sheet.getRange(`${col}${engineRows.creatorRevenue}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.advertisers)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.campaigns)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.campaignBudget)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.campaignTake)}/12`]];
    sheet.getRange(`${col}${engineRows.displayRevenue}`).formulas = [[`=${col}${engineRows.totalMau}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.displayArpu)}/12`]];
    sheet.getRange(`${col}${engineRows.hotelRevenue}`).formulas = [[`=${col}${engineRows.totalOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.hotelOrderShare)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.hotelIncome)}`]];
    sheet.getRange(`${col}${engineRows.totalRevenue}`).formulas = [[`=SUM(${col}${engineRows.bookingRevenue}:${col}${engineRows.hotelRevenue})`]];

    sheet.getRange(`${col}${engineRows.rndCost}`).formulas = [[`=IF(${col}$8=1,${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.rnd)},0)`]];
    sheet.getRange(`${col}${engineRows.serverFixed}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.serverBase)}`]];
    sheet.getRange(`${col}${engineRows.serverOrderCost}`).formulas = [[`=${col}${engineRows.totalOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.serverOrder)}`]];
    sheet.getRange(`${col}${engineRows.serverAccountCost}`).formulas = [[`=(${col}${engineRows.activeStores}+${col}${engineRows.activeTechs}+${col}${engineRows.totalMau})*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.serverAccount)}`]];
    sheet.getRange(`${col}${engineRows.serverTotal}`).formulas = [[`=SUM(${col}${engineRows.serverFixed}:${col}${engineRows.serverAccountCost})`]];
    sheet.getRange(`${col}${engineRows.payrollCost}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.nonRndPayroll)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.fixedCostPattern}`]];
    sheet.getRange(`${col}${engineRows.marketingCost}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.marketing)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.fixedCostPattern}`]];
    sheet.getRange(`${col}${engineRows.bizdevCost}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.bizdev)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.fixedCostPattern}`]];
    sheet.getRange(`${col}${engineRows.supportCost}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.support)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.fixedCostPattern}`]];
    sheet.getRange(`${col}${engineRows.adminCost}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.admin)}*'${sheets.assumptions}'!$${patternCol}$${assumptionRows.fixedCostPattern}`]];
    sheet.getRange(`${col}${engineRows.successFeeCost}`).formulas = [[`=${col}${engineRows.salesReferralStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.successFee)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.successCoverage)}`]];
    sheet.getRange(`${col}${engineRows.adEventAcquisitionCost}`).formulas = [[`=${col}${engineRows.adEventStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.adEventCac)}`]];
    sheet.getRange(`${col}${engineRows.ekycCost}`).formulas = [[`=${col}${engineRows.ekycVolume}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ekycUnit)}`]];
    sheet.getRange(`${col}${engineRows.riskCost}`).formulas = [[`=${col}${engineRows.totalOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.riskPerOrder)}`]];
    sheet.getRange(`${col}${engineRows.paymentCost}`).formulas = [[`=SUM(${col}${engineRows.bookingRevenue},${col}${engineRows.storeRevenue},${col}${engineRows.memberRevenue},${col}${engineRows.douRevenue},${col}${engineRows.rankingRevenue},${col}${engineRows.creatorRevenue})*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.paymentRate)}`]];
    sheet.getRange(`${col}${engineRows.userRebateCost}`).formulas = [[`=${col}${engineRows.totalOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.userRebate)}`]];
    sheet.getRange(`${col}${engineRows.hotelCost}`).formulas = [[`=${col}${engineRows.totalOrders}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.hotelOrderShare)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.hotelPayout)}`]];
    sheet.getRange(`${col}${engineRows.totalCosts}`).formulas = [[`=SUM(${col}${engineRows.rndCost},${col}${engineRows.serverTotal},${col}${engineRows.payrollCost}:${col}${engineRows.hotelCost})`]];
    sheet.getRange(`${col}${engineRows.preEkycProfit}`).formulas = [[`=${col}${engineRows.totalRevenue}-${col}${engineRows.totalCosts}+${col}${engineRows.ekycCost}`]];
    sheet.getRange(`${col}${engineRows.operatingProfit}`).formulas = [[`=${col}${engineRows.totalRevenue}-${col}${engineRows.totalCosts}`]];
    sheet.getRange(`${col}${engineRows.margin}`).formulas = [[`=IF(${col}${engineRows.totalRevenue}=0,0,${col}${engineRows.operatingProfit}/${col}${engineRows.totalRevenue})`]];
    sheet.getRange(`${col}${engineRows.financing}`).formulas = [[`=IF(${col}$7=1,${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.financing)},0)`]];
    sheet.getRange(`${col}${engineRows.openingCash}`).formulas = [[i === 0 ? `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.openingCash)}` : `=${prevCol}${engineRows.endingCash}`]];
    sheet.getRange(`${col}${engineRows.endingCash}`).formulas = [[`=${col}${engineRows.openingCash}+${col}${engineRows.operatingProfit}+${col}${engineRows.financing}`]];
  }

  sheet.getRange("C10:AL75").format.font = { color: colors.linkGreen };
  sheet.getRange("C10:AL75").format.numberFormat = fmt.one;
  sheet.getRange(`C${engineRows.productivity}:AL${engineRows.productivity}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.chargeableRatio}:AL${engineRows.chargeableRatio}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled}`).format.numberFormat = "0";
  sheet.getRange(`C${engineRows.bookingRevenue}:AL${engineRows.operatingProfit}`).format.numberFormat = fmt.raw;
  sheet.getRange(`C${engineRows.margin}:AL${engineRows.margin}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.financing}:AL${engineRows.endingCash}`).format.numberFormat = fmt.raw;
  sheet.getRange("A10:B75").format.wrapText = true;
  bodyBorders(sheet.getRange("A10:AL36"));
  bodyBorders(sheet.getRange("A38:AL47"));
  bodyBorders(sheet.getRange("A50:AL70"));
  bodyBorders(sheet.getRange("A73:AL75"));
  for (const row of [engineRows.activeStores, engineRows.totalOrders, engineRows.totalRevenue, engineRows.serverTotal, engineRows.totalCosts, engineRows.preEkycProfit, engineRows.operatingProfit, engineRows.endingCash]) {
    styleTotal(sheet, `A${row}:AL${row}`);
  }
  sheet.getRange("A1:AL75").format.font = { name: "Arial", size: 9 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.getRange("A:A").format.columnWidth = 34;
  sheet.getRange("B:B").format.columnWidth = 16;
  sheet.getRange("C:AL").format.columnWidth = 12;
  sheet.freezePanes.freezeRows(8);
  sheet.freezePanes.freezeColumns(2);
  sheet.showGridLines = false;
}

function yearRange(year) {
  const start = 2 + (year - 1) * 12;
  const end = start + 11;
  return { start: colName(start), end: colName(end) };
}

function buildAnnual(sheet, config) {
  const { t, sheets } = config;
  titleBand(sheet, "A1:H1", t.annualTitle);
  noteBand(sheet, "A2:H2", config.key === "jp" ? "Y1/Y2/Y3は36か月モデルから集計。eKYC開始月はモデル通算月です。" : "Y1/Y2/Y3由36个月模型汇总；eKYC启用月份为模型累计月份。" );
  sheet.getRange("A4:H4").values = [[t.parameter, t.unit, `${t.scenarioA} ${t.y1}`, `${t.scenarioA} ${t.y2}`, `${t.scenarioA} ${t.y3}`, `${t.scenarioB} ${t.y1}`, `${t.scenarioB} ${t.y2}`, `${t.scenarioB} ${t.y3}`]];
  headerStyle(sheet.getRange("A4:H4"));
  const rows = [
    [5, t.activeStores, "store", engineRows.activeStores, "end"],
    [6, config.key === "jp" ? "年平均稼働店舗数" : "年平均活跃店铺数", "store", engineRows.activeStores, "avg"],
    [7, t.activeTechs, "person", engineRows.activeTechs, "end"],
    [8, t.totalMau, "MAU", engineRows.totalMau, "end"],
    [9, t.totalOrders, "order", engineRows.totalOrders, "sum"],
    [10, config.key === "jp" ? "eKYC開始モデル月" : "eKYC启用模型月", "month", engineRows.ekycEnabled, "match"],
    [11, t.unmetForeignOrders, "order", engineRows.unmetForeignOrders, "sum"],
    [13, t.bookingRevenue, "JPY m", engineRows.bookingRevenue, "sum"],
    [14, t.storeRevenue, "JPY m", engineRows.storeRevenue, "sum"],
    [15, t.s2bRevenue, "JPY m", engineRows.s2bRevenue, "sum"],
    [16, t.memberRevenue, "JPY m", engineRows.memberRevenue, "sum"],
    [17, t.douRevenue, "JPY m", engineRows.douRevenue, "sum"],
    [18, t.rankingRevenue, "JPY m", engineRows.rankingRevenue, "sum"],
    [19, t.creatorRevenue, "JPY m", engineRows.creatorRevenue, "sum"],
    [20, t.displayRevenue, "JPY m", engineRows.displayRevenue, "sum"],
    [21, t.hotelRevenue, "JPY m", engineRows.hotelRevenue, "sum"],
    [22, t.totalRevenue, "JPY m", engineRows.totalRevenue, "sum"],
    [25, t.rndCost, "JPY m", engineRows.rndCost, "sum"],
    [26, t.serverTotal, "JPY m", engineRows.serverTotal, "sum"],
    [27, t.payrollCost, "JPY m", engineRows.payrollCost, "sum"],
    [28, t.marketingCost, "JPY m", engineRows.marketingCost, "sum"],
    [29, t.bizdevCost, "JPY m", engineRows.bizdevCost, "sum"],
    [30, t.supportCost, "JPY m", engineRows.supportCost, "sum"],
    [31, t.adminCost, "JPY m", engineRows.adminCost, "sum"],
    [32, t.successFeeCost, "JPY m", engineRows.successFeeCost, "sum"],
    [33, t.adEventAcquisitionCost, "JPY m", engineRows.adEventAcquisitionCost, "sum"],
    [34, t.ekycCost, "JPY m", engineRows.ekycCost, "sum"],
    [35, t.riskCost, "JPY m", engineRows.riskCost, "sum"],
    [36, t.paymentCost, "JPY m", engineRows.paymentCost, "sum"],
    [37, t.userRebateCost, "JPY m", engineRows.userRebateCost, "sum"],
    [38, t.hotelCost, "JPY m", engineRows.hotelCost, "sum"],
    [39, t.totalCosts, "JPY m", engineRows.totalCosts, "sum"],
    [41, t.preEkycProfit, "JPY m", engineRows.preEkycProfit, "sum"],
    [42, t.operatingProfit, "JPY m", engineRows.operatingProfit, "sum"],
    [43, t.margin, "%", engineRows.margin, "margin"],
    [44, t.endingCash, "JPY m", engineRows.endingCash, "end"],
  ];
  sectionBand(sheet, "A12:H12", t.revenue);
  sectionBand(sheet, "A24:H24", t.costs);
  sheet.getRange("A5:B11").values = rows.filter((r) => r[0] <= 11).map((r) => [r[1], r[2]]);
  sheet.getRange("A13:B22").values = rows.filter((r) => r[0] >= 13 && r[0] <= 22).map((r) => [r[1], r[2]]);
  sheet.getRange("A25:B39").values = rows.filter((r) => r[0] >= 25 && r[0] <= 39).map((r) => [r[1], r[2]]);
  sheet.getRange("A41:B44").values = rows.filter((r) => r[0] >= 41).map((r) => [r[1], r[2]]);
  for (const scenario of ["A", "B"]) {
    const engine = scenario === "A" ? sheets.engineA : sheets.engineB;
    const outputBase = scenario === "A" ? 2 : 5;
    for (let year = 1; year <= 3; year++) {
      const outCol = colName(outputBase + year - 1);
      const range = yearRange(year);
      for (const [row, , , engineRow, mode] of rows) {
        let formula;
        if (mode === "sum") formula = `=SUM('${engine}'!${range.start}${engineRow}:${range.end}${engineRow})/1000000`;
        if (mode === "avg") formula = `=AVERAGE('${engine}'!${range.start}${engineRow}:${range.end}${engineRow})`;
        if (mode === "end") formula = `='${engine}'!${range.end}${engineRow}` + (row === 44 ? "/1000000" : "");
        if (mode === "margin") formula = `=IF(${outCol}22=0,0,${outCol}42/${outCol}22)`;
        if (mode === "match") formula = `=IF(SUM('${engine}'!$C$${engineRows.ekycEnabled}:$AL$${engineRows.ekycEnabled})=0,0,MATCH(1,'${engine}'!$C$${engineRows.ekycEnabled}:$AL$${engineRows.ekycEnabled},0))`;
        sheet.getRange(`${outCol}${row}`).formulas = [[formula]];
      }
    }
  }
  bodyBorders(sheet.getRange("A5:H11"));
  bodyBorders(sheet.getRange("A13:H22"));
  bodyBorders(sheet.getRange("A25:H39"));
  bodyBorders(sheet.getRange("A41:H44"));
  sheet.getRange("C5:H44").format.font = { color: colors.linkGreen };
  sheet.getRange("C5:H11").format.numberFormat = fmt.one;
  sheet.getRange("C13:H42").format.numberFormat = fmt.moneyM;
  sheet.getRange("C43:H43").format.numberFormat = fmt.pct;
  sheet.getRange("C44:H44").format.numberFormat = fmt.moneyM;
  for (const row of [22, 39, 41, 42, 44]) styleTotal(sheet, `A${row}:H${row}`);
  sheet.getRange("A:A").format.columnWidth = 38;
  sheet.getRange("B:B").format.columnWidth = 15;
  sheet.getRange("C:H").format.columnWidth = 16;
  sheet.getRange("A1:H44").format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(2);
  sheet.showGridLines = false;
}

function monthlyRowMap() {
  return [
    [5, engineRows.newStores], [6, engineRows.activeStores], [7, engineRows.activeTechs], [8, engineRows.totalMau], [9, engineRows.totalOrders], [10, engineRows.ekycEnabled], [11, engineRows.unmetForeignOrders],
    [13, engineRows.bookingRevenue], [14, engineRows.storeRevenue], [15, engineRows.s2bRevenue], [16, engineRows.memberRevenue], [17, engineRows.douRevenue], [18, engineRows.rankingRevenue], [19, engineRows.creatorRevenue], [20, engineRows.displayRevenue], [21, engineRows.hotelRevenue], [22, engineRows.totalRevenue],
    [25, engineRows.rndCost], [26, engineRows.serverTotal], [27, engineRows.payrollCost], [28, engineRows.marketingCost], [29, engineRows.bizdevCost], [30, engineRows.supportCost], [31, engineRows.adminCost], [32, engineRows.successFeeCost], [33, engineRows.adEventAcquisitionCost], [34, engineRows.ekycCost], [35, engineRows.riskCost], [36, engineRows.paymentCost], [37, engineRows.userRebateCost], [38, engineRows.hotelCost], [39, engineRows.totalCosts],
    [41, engineRows.preEkycProfit], [42, engineRows.operatingProfit], [43, engineRows.margin], [44, engineRows.endingCash],
  ];
}

function buildY1(sheet, config) {
  const { t, sheets } = config;
  titleBand(sheet, "A1:O1", t.y1Title);
  noteBand(sheet, "A2:O2", config.key === "jp" ? "各月は36か月モデルへのリンク。Y1合計はフロー項目を合計し、期末項目はM12を表示。" : "各月链接36个月模型；流量项目按月合计，期末项目显示M12。" );
  const blockStarts = [4, 49];
  const scenarios = [
    { code: "A", name: t.scenarioA, engine: sheets.engineA },
    { code: "B", name: t.scenarioB, engine: sheets.engineB },
  ];
  const labels = [
    [t.newStores, "store"], [t.activeStores, "store"], [t.activeTechs, "person"], [t.totalMau, "MAU"], [t.totalOrders, "order"], [t.ekycEnabled, "0/1"], [t.unmetForeignOrders, "order"],
    [t.bookingRevenue, "JPY m"], [t.storeRevenue, "JPY m"], [t.s2bRevenue, "JPY m"], [t.memberRevenue, "JPY m"], [t.douRevenue, "JPY m"], [t.rankingRevenue, "JPY m"], [t.creatorRevenue, "JPY m"], [t.displayRevenue, "JPY m"], [t.hotelRevenue, "JPY m"], [t.totalRevenue, "JPY m"],
    [t.rndCost, "JPY m"], [t.serverTotal, "JPY m"], [t.payrollCost, "JPY m"], [t.marketingCost, "JPY m"], [t.bizdevCost, "JPY m"], [t.supportCost, "JPY m"], [t.adminCost, "JPY m"], [t.successFeeCost, "JPY m"], [t.adEventAcquisitionCost, "JPY m"], [t.ekycCost, "JPY m"], [t.riskCost, "JPY m"], [t.paymentCost, "JPY m"], [t.userRebateCost, "JPY m"], [t.hotelCost, "JPY m"], [t.totalCosts, "JPY m"],
    [t.preEkycProfit, "JPY m"], [t.operatingProfit, "JPY m"], [t.margin, "%"], [t.endingCash, "JPY m"],
  ];
  const rowMap = monthlyRowMap();
  for (let b = 0; b < 2; b++) {
    const start = blockStarts[b];
    const { name, engine } = scenarios[b];
    sectionBand(sheet, `A${start}:O${start}`, name);
    sheet.getRange(`A${start + 1}:O${start + 1}`).values = [[t.parameter, t.unit, ...Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`), t.y1]];
    headerStyle(sheet.getRange(`A${start + 1}:O${start + 1}`));
    const offsetRows = rowMap.map(([r]) => r - 4 + start);
    for (let i = 0; i < labels.length; i++) {
      const outputRow = offsetRows[i];
      sheet.getRange(`A${outputRow}:B${outputRow}`).values = [[labels[i][0], labels[i][1]]];
      const engineRow = rowMap[i][1];
      const formulas = [];
      for (let m = 0; m < 12; m++) {
        const engineCol = colName(2 + m);
        const scale = engineRow >= engineRows.bookingRevenue && engineRow !== engineRows.margin ? "/1000000" : "";
        formulas.push(`='${engine}'!${engineCol}${engineRow}${scale}`);
      }
      sheet.getRange(`C${outputRow}:N${outputRow}`).formulas = [[...formulas]];
      let totalFormula;
      const endMetrics = new Set([engineRows.activeStores, engineRows.activeTechs, engineRows.totalMau, engineRows.ekycEnabled, engineRows.margin, engineRows.endingCash]);
      if (engineRow === engineRows.margin) totalFormula = `=IF(O${offsetRows[16]}=0,0,O${offsetRows[33]}/O${offsetRows[16]})`;
      else if (endMetrics.has(engineRow)) totalFormula = `=N${outputRow}`;
      else totalFormula = `=SUM(C${outputRow}:N${outputRow})`;
      sheet.getRange(`O${outputRow}`).formulas = [[totalFormula]];
    }
    bodyBorders(sheet.getRange(`A${start + 2}:O${start + 40}`));
    sheet.getRange(`C${start + 2}:O${start + 40}`).format.font = { color: colors.linkGreen };
    sheet.getRange(`C${offsetRows[0]}:O${offsetRows[6]}`).format.numberFormat = fmt.one;
    sheet.getRange(`C${offsetRows[7]}:O${offsetRows[33]}`).format.numberFormat = fmt.moneyM;
    sheet.getRange(`C${offsetRows[34]}:O${offsetRows[34]}`).format.numberFormat = fmt.pct;
    sheet.getRange(`C${offsetRows[35]}:O${offsetRows[35]}`).format.numberFormat = fmt.moneyM;
    for (const idx of [16, 31, 32, 33, 35]) styleTotal(sheet, `A${offsetRows[idx]}:O${offsetRows[idx]}`);
  }
  sheet.getRange("A:A").format.columnWidth = 38;
  sheet.getRange("B:B").format.columnWidth = 13;
  sheet.getRange("C:O").format.columnWidth = 12;
  sheet.getRange("A1:O92").format.font = { name: "Arial", size: 9 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.freezePanes.freezeRows(5);
  sheet.freezePanes.freezeColumns(2);
  sheet.showGridLines = false;
}

function buildCash(sheet, config) {
  const { t, sheets } = config;
  titleBand(sheet, "A1:O1", t.cashTitle);
  noteBand(sheet, "A2:O2", config.key === "jp" ? "税金・運転資本・設備投資は未指定のため含めず、営業利益を営業キャッシュフローの近似として使用。" : "因未提供税费、营运资金及资本开支假设，本表用营业利润近似经营现金流。" );
  const blocks = [
    { start: 4, name: t.scenarioA, engine: sheets.engineA },
    { start: 13, name: t.scenarioB, engine: sheets.engineB },
  ];
  for (const block of blocks) {
    sectionBand(sheet, `A${block.start}:O${block.start}`, `${block.name}｜${t.y1}`);
    sheet.getRange(`A${block.start + 1}:O${block.start + 1}`).values = [[t.parameter, t.unit, ...Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`), t.y1]];
    headerStyle(sheet.getRange(`A${block.start + 1}:O${block.start + 1}`));
    const items = [
      [t.openingCashLabel, engineRows.openingCash, "end"],
      [t.financing, engineRows.financing, "sum"],
      [config.key === "jp" ? "営業キャッシュフロー" : "经营现金流", engineRows.operatingProfit, "sum"],
      [t.endingCash, engineRows.endingCash, "end"],
    ];
    for (let r = 0; r < items.length; r++) {
      const row = block.start + 2 + r;
      sheet.getRange(`A${row}:B${row}`).values = [[items[r][0], "JPY m"]];
      sheet.getRange(`C${row}:N${row}`).formulas = [[...Array.from({ length: 12 }, (_, i) => `='${block.engine}'!${colName(2 + i)}${items[r][1]}/1000000`)]];
      sheet.getRange(`O${row}`).formulas = [[items[r][2] === "sum" ? `=SUM(C${row}:N${row})` : `=N${row}`]];
    }
    bodyBorders(sheet.getRange(`A${block.start + 2}:O${block.start + 5}`));
    sheet.getRange(`C${block.start + 2}:O${block.start + 5}`).format.font = { color: colors.linkGreen };
    sheet.getRange(`C${block.start + 2}:O${block.start + 5}`).format.numberFormat = fmt.moneyM;
    styleTotal(sheet, `A${block.start + 5}:O${block.start + 5}`);
  }
  sectionBand(sheet, "A22:H22", config.key === "jp" ? "3カ年キャッシュサマリー" : "三年现金汇总");
  sheet.getRange("A23:H23").values = [[t.parameter, t.unit, `${t.scenarioA} ${t.y1}`, `${t.scenarioA} ${t.y2}`, `${t.scenarioA} ${t.y3}`, `${t.scenarioB} ${t.y1}`, `${t.scenarioB} ${t.y2}`, `${t.scenarioB} ${t.y3}`]];
  headerStyle(sheet.getRange("A23:H23"));
  const annualItems = [
    [t.financing, engineRows.financing, "sum"],
    [config.key === "jp" ? "営業キャッシュフロー" : "经营现金流", engineRows.operatingProfit, "sum"],
    [t.endingCash, engineRows.endingCash, "end"],
  ];
  sheet.getRange("A24:B26").values = annualItems.map((x) => [x[0], "JPY m"]);
  for (const scenario of ["A", "B"]) {
    const engine = scenario === "A" ? sheets.engineA : sheets.engineB;
    const base = scenario === "A" ? 2 : 5;
    for (let year = 1; year <= 3; year++) {
      const outCol = colName(base + year - 1);
      const range = yearRange(year);
      for (let r = 0; r < annualItems.length; r++) {
        const [,, mode] = annualItems[r];
        const engineRow = annualItems[r][1];
        sheet.getRange(`${outCol}${24 + r}`).formulas = [[mode === "sum" ? `=SUM('${engine}'!${range.start}${engineRow}:${range.end}${engineRow})/1000000` : `='${engine}'!${range.end}${engineRow}/1000000`]];
      }
    }
  }
  bodyBorders(sheet.getRange("A24:H26"));
  sheet.getRange("C24:H26").format.font = { color: colors.linkGreen };
  sheet.getRange("C24:H26").format.numberFormat = fmt.moneyM;
  styleTotal(sheet, "A26:H26");
  sheet.getRange("A:A").format.columnWidth = 34;
  sheet.getRange("B:B").format.columnWidth = 13;
  sheet.getRange("C:O").format.columnWidth = 12;
  sheet.getRange("A1:O26").format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.showGridLines = false;
}

function buildChecks(sheet, config) {
  const { t, sheets } = config;
  titleBand(sheet, "A1:G1", t.checksTitle);
  sheet.getRange("A2:B2").values = [[t.status, null]];
  sheet.getRange("B2").values = [[config.key === "jp" ? "計算中" : "计算中"]];
  sheet.getRange("A2:B2").format = { fill: colors.lightBlue, font: { bold: true, size: 14 }, borders: { preset: "outside", style: "medium", color: colors.navy } };
  sheet.getRange("A5:G5").values = [[t.check, t.actual, t.expected, t.delta, t.tolerance, t.status, t.fix]];
  headerStyle(sheet.getRange("A5:G5"));

  const checks = [];
  for (const scenario of ["A", "B"]) {
    const engine = scenario === "A" ? sheets.engineA : sheets.engineB;
    for (let year = 1; year <= 3; year++) {
      const range = yearRange(year);
      const assumption = assumptionRef(sheets.assumptions, scenario, year, assumptionRows.eoyStores);
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "期末店舗数" : "期末店铺数"}`,
        actual: `='${engine}'!${range.end}${engineRows.activeStores}`,
        expected: `=${assumption}`,
        tolerance: 0.01,
        fix: `${engine}!${range.end}${engineRows.activeStores}`,
      });
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "獲得チャネル比率合計" : "获客渠道占比合计"}`,
        actual: `=SUM(${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.salesReferralShare)},${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.organicShare)},${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.adEventShare)})`,
        expected: "=1",
        tolerance: 0.0001,
        fix: `${sheets.assumptions}!${scenarioCell(scenario, year, assumptionRows.salesReferralShare)}:${scenarioCell(scenario, year, assumptionRows.adEventShare)}`,
      });
    }
  }
  for (const scenario of ["A", "B"]) {
    const engine = scenario === "A" ? sheets.engineA : sheets.engineB;
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "Y1店舗月額売上" : "Y1店铺月费收入"}`,
      actual: `=SUM('${engine}'!C${engineRows.storeRevenue}:N${engineRows.storeRevenue})`,
      expected: `=SUM('${engine}'!C${engineRows.activeStores}:N${engineRows.activeStores})*${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.storeFee)}`,
      tolerance: 1,
      fix: `${engine}!C${engineRows.storeRevenue}:N${engineRows.storeRevenue}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "Y1成功報酬" : "Y1成功报酬"}`,
      actual: `=SUM('${engine}'!C${engineRows.successFeeCost}:N${engineRows.successFeeCost})`,
      expected: `=SUM('${engine}'!C${engineRows.salesReferralStores}:N${engineRows.salesReferralStores})*${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.successFee)}*${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.successCoverage)}`,
      tolerance: 1,
      fix: `${engine}!C${engineRows.successFeeCost}:N${engineRows.successFeeCost}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "Y1サーバー費用" : "Y1服务器费用"}`,
      actual: `=SUM('${engine}'!C${engineRows.serverTotal}:N${engineRows.serverTotal})`,
      expected: `=SUM('${engine}'!C${engineRows.serverFixed}:N${engineRows.serverAccountCost})`,
      tolerance: 1,
      fix: `${engine}!C${engineRows.serverFixed}:N${engineRows.serverTotal}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "Y1獲得チャネル店舗数" : "Y1获客渠道店铺数"}`,
      actual: `=SUM('${engine}'!C${engineRows.newStores}:N${engineRows.newStores})`,
      expected: `=SUM('${engine}'!C${engineRows.salesReferralStores}:N${engineRows.adEventStores})`,
      tolerance: 0.01,
      fix: `${engine}!C${engineRows.newStores}:N${engineRows.adEventStores}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "初期開発費M01" : "初期开发费M01"}`,
      actual: `='${engine}'!C${engineRows.rndCost}`,
      expected: `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.rnd)}`,
      tolerance: 1,
      fix: `${engine}!C${engineRows.rndCost}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "M02以降の初期開発費" : "M02以后初期开发费"}`,
      actual: `=SUM('${engine}'!D${engineRows.rndCost}:AL${engineRows.rndCost})`,
      expected: "=0",
      tolerance: 1,
      fix: `${engine}!D${engineRows.rndCost}:AL${engineRows.rndCost}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "M01サーバー固定基盤" : "M01服务器固定基线"}`,
      actual: `='${engine}'!C${engineRows.serverFixed}`,
      expected: `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.serverBase)}`,
      tolerance: 1,
      fix: `${engine}!C${engineRows.serverFixed}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "サーバー費用の利用量連動" : "服务器费用随用量增长"}`,
      actual: `='${engine}'!N${engineRows.serverTotal}`,
      expected: `='${engine}'!C${engineRows.serverTotal}`,
      tolerance: 0,
      fix: `${engine}!C${engineRows.serverTotal}:N${engineRows.serverTotal}`,
      comparator: "gte",
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "最低契約期間内の解約" : "最低合同期内店铺流失"}`,
      actual: `=SUM('${engine}'!C${engineRows.churnedStores}:H${engineRows.churnedStores})`,
      expected: "=0",
      tolerance: 0.01,
      fix: `${engine}!C${engineRows.churnedStores}:H${engineRows.churnedStores}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "eKYC最短開始月" : "eKYC最早启用月"}`,
      actual: `=IF(SUM('${engine}'!C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled})=0,0,MATCH(1,'${engine}'!C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled},0))`,
      expected: `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.ekycEarliest)}`,
      tolerance: 0,
      fix: `${engine}!C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled}`,
      comparator: "gteOrZero",
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "eKYC利益ゲート" : "eKYC利润门槛"}`,
      actual: `=IF(SUM('${engine}'!C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled})=0,1,IF(MATCH(1,'${engine}'!C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled},0)=1,0,IF(INDEX('${engine}'!C${engineRows.preEkycProfit}:AL${engineRows.preEkycProfit},1,MATCH(1,'${engine}'!C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled},0)-1)>0,1,0)))`,
      expected: "=1",
      tolerance: 0,
      fix: `${engine}!${engineRows.ekycEnabled}/${engineRows.preEkycProfit}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "最大処理能力" : "最大订单容量"}`,
      actual: `=MAX('${engine}'!C${engineRows.totalOrders}:AL${engineRows.totalOrders}/'${engine}'!C${engineRows.activeTechs}:AL${engineRows.activeTechs}/4)`,
      expected: `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.capacityPerTechWeek)}`,
      tolerance: 0,
      fix: `${engine}!${engineRows.totalOrders}/${engineRows.activeTechs}`,
      comparator: "lte",
    });
  }
  checks.push({
    name: config.key === "jp" ? "月次獲得配分合計" : "月度签约分配合计",
    actual: `=SUM('${sheets.assumptions}'!C${assumptionRows.storePattern}:N${assumptionRows.storePattern})`,
    expected: "=1",
    tolerance: 0.0001,
    fix: `${sheets.assumptions}!C${assumptionRows.storePattern}:N${assumptionRows.storePattern}`,
  });
  checks.push({
    name: config.key === "jp" ? "月次外国人配分合計" : "外国用户月度分配合计",
    actual: `=SUM('${sheets.assumptions}'!C${assumptionRows.foreignPattern}:N${assumptionRows.foreignPattern})`,
    expected: "=1",
    tolerance: 0.0001,
    fix: `${sheets.assumptions}!C${assumptionRows.foreignPattern}:N${assumptionRows.foreignPattern}`,
  });
  checks.push({
    name: config.key === "jp" ? "月次固定費配分合計" : "固定费用月度分配合计",
    actual: `=SUM('${sheets.assumptions}'!C${assumptionRows.fixedCostPattern}:N${assumptionRows.fixedCostPattern})`,
    expected: "=1",
    tolerance: 0.0001,
    fix: `${sheets.assumptions}!C${assumptionRows.fixedCostPattern}:N${assumptionRows.fixedCostPattern}`,
  });

  const startRow = 6;
  for (let i = 0; i < checks.length; i++) {
    const row = startRow + i;
    const item = checks[i];
    sheet.getRange(`A${row}`).values = [[item.name]];
    sheet.getRange(`B${row}`).formulas = [[item.actual]];
    sheet.getRange(`C${row}`).formulas = [[item.expected]];
    sheet.getRange(`D${row}`).formulas = [[`=B${row}-C${row}`]];
    sheet.getRange(`E${row}`).values = [[item.tolerance]];
    let statusFormula = `=IF(ABS(D${row})<=E${row},"${t.ok}","${t.fail}")`;
    if (item.comparator === "gteOrZero") statusFormula = `=IF(OR(B${row}=0,B${row}>=C${row}),"${t.ok}","${t.fail}")`;
    if (item.comparator === "gte") statusFormula = `=IF(B${row}>=C${row},"${t.ok}","${t.fail}")`;
    if (item.comparator === "lte") statusFormula = `=IF(B${row}<=C${row},"${t.ok}","${t.fail}")`;
    sheet.getRange(`F${row}`).formulas = [[statusFormula]];
    sheet.getRange(`G${row}`).values = [[item.fix]];
  }
  const endRow = startRow + checks.length - 1;
  sheet.getRange("B2").formulas = [[`=IF(COUNTIF(F6:F${endRow},"${t.fail}")=0,"${t.pass}","${t.fail}")`]];
  bodyBorders(sheet.getRange(`A${startRow}:G${endRow}`));
  sheet.getRange(`B${startRow}:F${endRow}`).format.font = { color: colors.linkGreen };
  sheet.getRange(`B${startRow}:E${endRow}`).format.numberFormat = fmt.one;
  sheet.getRange(`F${startRow}:F${endRow}`).conditionalFormats.add("containsText", { text: t.ok, format: { fill: colors.lightGreen, font: { color: "#006100", bold: true } } });
  sheet.getRange(`F${startRow}:F${endRow}`).conditionalFormats.add("containsText", { text: t.fail, format: { fill: colors.lightRed, font: { color: "#9C0006", bold: true } } });
  sheet.getRange("B2").conditionalFormats.add("containsText", { text: t.pass, format: { fill: colors.lightGreen, font: { color: "#006100", bold: true } } });
  sheet.getRange("B2").conditionalFormats.add("containsText", { text: t.fail, format: { fill: colors.lightRed, font: { color: "#9C0006", bold: true } } });
  sheet.getRange("A:A").format.columnWidth = 38;
  sheet.getRange("B:E").format.columnWidth = 16;
  sheet.getRange("F:F").format.columnWidth = 12;
  sheet.getRange("G:G").format.columnWidth = 44;
  sheet.getRange(`A1:G${endRow}`).format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.freezePanes.freezeRows(5);
  sheet.showGridLines = false;
}

function buildSources(sheet, config) {
  const { t } = config;
  titleBand(sheet, "A1:E1", t.sourcesTitle);
  noteBand(sheet, "A2:E2", config.key === "jp" ? "ユーザー指定と日本市場の公開資料を用いた計画モデル。市場実績は方向性・上限の参考であり、NeeDoの実績値ではありません。" : "本模型结合用户要求及日本市场公开资料；市场数据仅用于校准方向和上限，并非NeeDo实际业绩。" );
  sheet.getRange("A4:E4").values = [[t.sourceItem, t.treatment, t.source, config.key === "jp" ? "日付" : "日期", t.note]];
  headerStyle(sheet.getRange("A4:E4"));
  const rows = config.key === "jp" ? [
    ["店舗固定月額", "全稼働店舗×月額9,800円。契約開始月から月次認識", "ユーザー指定", "2026-08-21", "Booking無料期間とは分離"],
    ["最低契約期間", "6か月以内の店舗解約を0。6か月分の前受金なし", "ユーザー指定", "2026-08-21", "解約率は7か月目以降に適用"],
    ["店舗成功報酬", "紹介・営業経由新規店舗×30,000円×対象比率", "ユーザー指定", "2026-08-21", "自然流入・広告イベント経由には成功報酬を課さない"],
    ["eKYC", "最初の6か月は0。前月のeKYC前営業利益がプラスになった翌月から開始", "ユーザー指定", "2026-08-21", "循環参照を避けるためeKYC前利益で判定"],
    ["初期開発費", "2,000万円をM01に一括計上。M02以降0", "ユーザー指定", "2026-08-22", "運用人員は別途人件費に計上"],
    ["サーバー費用", "固定25万円/月＋15円/完了取引＋10円/稼働アカウント/月", "https://aws.amazon.com/jp/fargate/pricing/ ; https://aws.amazon.com/jp/rds/pricing/ ; https://aws.amazon.com/jp/cloudwatch/pricing/", "2026-08-22", "AWSの最低料金なし・従量課金を参考にした管理仮定"],
    ["風俗関連市場上限", "R7無店舗型22,792件、うち派遣型等21,353件。総量は近年ほぼ横ばい", "https://www.npa.go.jp/news/release/2026/080423huzokukankeitoukei.pdf", "2026-08-22", "Bの6,000店は混合カテゴリーとPMF成立を条件とする上振れケース"],
    ["上門型成長ベンチマーク", "HOGUGU掲載セラピスト3,500名超(2025-02)→4,000名超(2025-07)→5,000名(2026-01)", "https://prtimes.jp/main/html/rd/p/000000024.000047992.html ; https://prtimes.jp/main/html/rd/p/000000028.000047992.html ; https://prtimes.jp/main/html/rd/p/000000035.000047992.html", "2026-08-22", "ネットワーク形成後の供給側加速を参考"],
    ["予約プラットフォーム", "HOT PEPPER Beauty予約数約290万(FY2011)→約1.6億(FY2024)、FY2019-24 GMV CAGR14.2%", "https://recruit-holdings.com/en/ir/library/upload/recruit_202603Q3_call-transcript_en/", "2026-08-22", "全国営業→店舗増→利用者増の好循環と広告施策を参考"],
    ["施術者直接予約", "minimoは登録サロンスタッフ7万人、月間利用者100万人、年間予約700万件の公表値", "https://minimodel.jp/info?from=footer", "2026-08-22", "個人・口コミ・自然流入型の供給獲得を参考"],
  ] : [
    ["店铺固定月费", "全部活跃店铺×每月9,800日元，自合同开始月按月确认", "用户要求", "2026-08-21", "与Booking免费期分开"],
    ["最低合同期限", "6个月内店铺流失为0，不按6个月预收", "用户要求", "2026-08-21", "流失率从第7个月起适用"],
    ["店铺成功报酬", "介绍及营业渠道新店×30,000日元×适用比例", "用户要求", "2026-08-21", "自然流入及广告活动渠道不计成功报酬"],
    ["eKYC", "前6个月为0；上月eKYC前营业利润为正时，于次月启用", "用户要求", "2026-08-21", "使用eKYC前利润判断，避免循环引用"],
    ["初期开发费", "2,000万日元仅在M01一次性计入，M02以后为0", "用户要求", "2026-08-22", "后续运维人员计入人力成本"],
    ["服务器费用", "固定25万日元/月＋15日元/完单＋10日元/活跃账户/月", "https://aws.amazon.com/jp/fargate/pricing/ ; https://aws.amazon.com/jp/rds/pricing/ ; https://aws.amazon.com/jp/cloudwatch/pricing/", "2026-08-22", "参考AWS无最低费用及按量计费模式的管理假设"],
    ["风俗相关市场上限", "R7无店铺型22,792家，其中派遣型等21,353家；近年总量基本平稳", "https://www.npa.go.jp/news/release/2026/080423huzokukankeitoukei.pdf", "2026-08-22", "B方案6,000家属于覆盖混合品类且形成PMF后的上行情景"],
    ["上门型增长基准", "HOGUGU上线技师3,500名以上(2025-02)→4,000名以上(2025-07)→5,000名(2026-01)", "https://prtimes.jp/main/html/rd/p/000000024.000047992.html ; https://prtimes.jp/main/html/rd/p/000000028.000047992.html ; https://prtimes.jp/main/html/rd/p/000000035.000047992.html", "2026-08-22", "用于校准平台形成网络后供给侧加速"],
    ["预约平台增长", "HOT PEPPER Beauty预约数约290万(FY2011)→约1.6亿(FY2024)，FY2019-24 GMV CAGR 14.2%", "https://recruit-holdings.com/en/ir/library/upload/recruit_202603Q3_call-transcript_en/", "2026-08-22", "参考全国营业、店铺增加、用户增加的正循环及营销活动"],
    ["技师直接预约", "minimo公开注册沙龙技师7万人、月度用户100万人、年度预约700万件", "https://minimodel.jp/info?from=footer", "2026-08-22", "用于校准个人、口碑及自然流入渠道"],
  ];
  sheet.getRange("A5:E14").values = rows;
  bodyBorders(sheet.getRange("A5:E14"));
  sectionBand(sheet, "A17:E17", t.versionHistory);
  sheet.getRange("A18:E18").values = [["Version", config.key === "jp" ? "更新日" : "更新日期", config.key === "jp" ? "主な変更" : "主要变更", config.key === "jp" ? "作成者" : "制作", t.note]];
  headerStyle(sheet.getRange("A18:E18"));
  sheet.getRange("A19:E21").values = config.key === "jp" ? [
    ["V1.5", "2026-08-19", "月額9,800円、最低契約6か月、初期30,000円総額", "Codex", "旧モデル"],
    ["V2.0", "2026-08-21", "36か月モデル、Y1月次、30,000円/新規店、サーバー変動費、eKYC利益ゲート", "Codex", "旧モデル"],
    ["V2.1", "2026-08-22", "開発費M01一括、サーバー従量化、店舗獲得3チャネル、B成長曲線再校準", "Codex", "本版"],
  ] : [
    ["V1.5", "2026-08-19", "月费9,800日元、最低合同6个月、初期30,000日元总额", "Codex", "旧模型"],
    ["V2.0", "2026-08-21", "36个月模型、第一年月度、每新店30,000日元、服务器变动费用、eKYC利润门槛", "Codex", "旧模型"],
    ["V2.1", "2026-08-22", "开发费M01一次性计入、服务器按量、店铺获客三渠道、重新校准B增长曲线", "Codex", "本版本"],
  ];
  bodyBorders(sheet.getRange("A19:E21"));
  sheet.getRange("A:E").format.wrapText = true;
  sheet.getRange("A:A").format.columnWidth = 28;
  sheet.getRange("B:B").format.columnWidth = 52;
  sheet.getRange("C:C").format.columnWidth = 62;
  sheet.getRange("D:D").format.columnWidth = 16;
  sheet.getRange("E:E").format.columnWidth = 38;
  sheet.getRange("A1:E21").format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.showGridLines = false;
}

function buildDashboard(sheet, config) {
  const { t, sheets } = config;
  titleBand(sheet, "A1:N1", t.dashboardTitle);
  noteBand(sheet, "A2:N2", t.dashboardNote);
  sectionBand(sheet, "A4:G4", t.annualSummary);
  sheet.getRange("A5:G5").values = [[t.parameter, `${t.scenarioA} ${t.y1}`, `${t.scenarioA} ${t.y2}`, `${t.scenarioA} ${t.y3}`, `${t.scenarioB} ${t.y1}`, `${t.scenarioB} ${t.y2}`, `${t.scenarioB} ${t.y3}`]];
  headerStyle(sheet.getRange("A5:G5"));
  const kpiRows = [
    [t.totalRevenue, 22, fmt.moneyM],
    [t.operatingProfit, 42, fmt.moneyM],
    [t.margin, 43, fmt.pct],
    [t.endingCash, 44, fmt.moneyM],
    [t.activeStores, 5, fmt.one],
    [config.key === "jp" ? "eKYC開始モデル月" : "eKYC启用模型月", 10, fmt.one],
  ];
  sheet.getRange("A6:A11").values = kpiRows.map((x) => [x[0]]);
  for (let i = 0; i < 6; i++) {
    sheet.getRange(`B${6 + i}:G${6 + i}`).formulas = [[...Array.from({ length: 6 }, (_, j) => `='${sheets.annual}'!${colName(2 + j)}${kpiRows[i][1]}`)]];
    sheet.getRange(`B${6 + i}:G${6 + i}`).format.numberFormat = kpiRows[i][2];
  }
  bodyBorders(sheet.getRange("A6:G11"));
  sheet.getRange("B6:G11").format.font = { color: colors.linkGreen };
  styleTotal(sheet, "A6:G6");
  styleTotal(sheet, "A7:G7");

  sectionBand(sheet, "A13:G13", t.y1Decision);
  sheet.getRange("A14:D14").values = [[t.parameter, t.scenarioA, t.scenarioB, t.note]];
  headerStyle(sheet.getRange("A14:D14"));
  const decisionRows = [
    [config.key === "jp" ? "Y1新規契約店舗" : "Y1新签约店铺", engineRows.newStores, "sum", "store", config.key === "jp" ? "3チャネル合計" : "三类渠道合计"],
    [t.salesReferralStores, engineRows.salesReferralStores, "sum", "store", config.key === "jp" ? "30,000円成功報酬の対象" : "适用30,000日元成功报酬"],
    [t.organicStores, engineRows.organicStores, "sum", "store", config.key === "jp" ? "口コミ・自然検索・店舗間紹介" : "口碑、自然搜索及店铺间推荐"],
    [t.adEventStores, engineRows.adEventStores, "sum", "store", config.key === "jp" ? "広告・キャンペーン・提携" : "广告、营销活动及联盟"],
    [t.successFeeCost, engineRows.successFeeCost, "sumM", "JPY m", config.key === "jp" ? "紹介・営業経由×30,000円" : "介绍及营业渠道×30,000日元"],
    [config.key === "jp" ? "M01サーバー費用" : "M01服务器费用", engineRows.serverTotal, "pointM1", "JPY m", config.key === "jp" ? "固定25万円＋利用量" : "固定25万日元＋实际用量"],
    [config.key === "jp" ? "M12サーバー費用" : "M12服务器费用", engineRows.serverTotal, "pointM12", "JPY m", config.key === "jp" ? "注文・アカウント増加を反映" : "反映订单及活跃账户增长"],
  ];
  sheet.getRange("A15:A21").values = decisionRows.map((x) => [x[0]]);
  sheet.getRange("D15:D21").values = decisionRows.map((x) => [x[4]]);
  for (let i = 0; i < decisionRows.length; i++) {
    for (let s = 0; s < 2; s++) {
      const engine = s === 0 ? sheets.engineA : sheets.engineB;
      const outCol = s === 0 ? "B" : "C";
      const [,, mode] = decisionRows[i];
      const engineRow = decisionRows[i][1];
      let formula;
      if (mode === "sum") formula = `=SUM('${engine}'!C${engineRow}:N${engineRow})`;
      if (mode === "sumM") formula = `=SUM('${engine}'!C${engineRow}:N${engineRow})/1000000`;
      if (mode === "match") formula = `=IF(SUM('${engine}'!C${engineRow}:AL${engineRow})=0,0,MATCH(1,'${engine}'!C${engineRow}:AL${engineRow},0))`;
      if (mode === "pointM1") formula = `='${engine}'!C${engineRow}/1000000`;
      if (mode === "pointM12") formula = `='${engine}'!N${engineRow}/1000000`;
      sheet.getRange(`${outCol}${15 + i}`).formulas = [[formula]];
    }
  }
  bodyBorders(sheet.getRange("A15:D21"));
  sheet.getRange("B15:C21").format.font = { color: colors.linkGreen };
  sheet.getRange("B15:C18").format.numberFormat = fmt.one;
  sheet.getRange("B19:C21").format.numberFormat = fmt.moneyM;

  sheet.getRange("I4:N4").merge();
  sheet.getRange("I4").values = [[t.status]];
  sheet.getRange("I4:N4").format = { fill: colors.darkNavy, font: { color: colors.white, bold: true }, horizontalAlignment: "center" };
  sheet.getRange("I5:N8").merge();
  sheet.getRange("I5").formulas = [[`='${sheets.checks}'!B2`]];
  sheet.getRange("I5:N8").format = { fill: colors.lightGreen, font: { color: "#006100", bold: true, size: 24 }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "medium", color: colors.navy } };

  sheet.getRange("A22:E34").values = [[t.month, `${t.scenarioA} ${t.totalRevenue}`, `${t.scenarioA} ${t.operatingProfit}`, `${t.scenarioB} ${t.totalRevenue}`, `${t.scenarioB} ${t.operatingProfit}`], ...Array.from({ length: 12 }, (_, i) => [`M${String(i + 1).padStart(2, "0")}`, null, null, null, null])];
  headerStyle(sheet.getRange("A22:E22"));
  for (let i = 0; i < 12; i++) {
    const engineCol = colName(2 + i);
    sheet.getRange(`B${23 + i}:E${23 + i}`).formulas = [[
      `='${sheets.engineA}'!${engineCol}${engineRows.totalRevenue}/1000000`,
      `='${sheets.engineA}'!${engineCol}${engineRows.operatingProfit}/1000000`,
      `='${sheets.engineB}'!${engineCol}${engineRows.totalRevenue}/1000000`,
      `='${sheets.engineB}'!${engineCol}${engineRows.operatingProfit}/1000000`,
    ]];
  }
  sheet.getRange("B23:E34").format.numberFormat = fmt.moneyM;
  sheet.getRange("B23:E34").format.font = { color: colors.linkGreen };
  bodyBorders(sheet.getRange("A23:E34"));

  sheet.getRange("A37:C49").values = [[t.month, `${t.scenarioA} ${t.activeStores}`, `${t.scenarioB} ${t.activeStores}`], ...Array.from({ length: 12 }, (_, i) => [`M${String(i + 1).padStart(2, "0")}`, null, null])];
  headerStyle(sheet.getRange("A37:C37"));
  for (let i = 0; i < 12; i++) {
    const engineCol = colName(2 + i);
    sheet.getRange(`B${38 + i}:C${38 + i}`).formulas = [[`='${sheets.engineA}'!${engineCol}${engineRows.activeStores}`, `='${sheets.engineB}'!${engineCol}${engineRows.activeStores}`]];
  }
  sheet.getRange("B38:C49").format.numberFormat = fmt.one;
  sheet.getRange("B38:C49").format.font = { color: colors.linkGreen };
  bodyBorders(sheet.getRange("A38:C49"));

  const chart1 = sheet.charts.add("line", sheet.getRange("A22:E34"));
  chart1.title = config.key === "jp" ? "Y1月次 売上高・営業利益（百万円）" : "第一年月度收入与营业利润（百万日元）";
  chart1.hasLegend = true;
  chart1.xAxis = { axisType: "textAxis" };
  chart1.yAxis = { numberFormatCode: "0.0" };
  chart1.setPosition("F22", "N36");

  const chart2 = sheet.charts.add("line", sheet.getRange("A37:C49"));
  chart2.title = config.key === "jp" ? "Y1月次 稼働店舗数" : "第一年月度活跃店铺数";
  chart2.hasLegend = true;
  chart2.xAxis = { axisType: "textAxis" };
  chart2.yAxis = { numberFormatCode: "#,##0" };
  chart2.setPosition("F38", "N52");

  sheet.getRange("A:A").format.columnWidth = 32;
  sheet.getRange("B:G").format.columnWidth = 15;
  sheet.getRange("H:H").format.columnWidth = 4;
  sheet.getRange("I:N").format.columnWidth = 15;
  sheet.getRange("A1:N52").format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.showGridLines = false;
}

const results = {};
for (const config of configs) {
  const workbook = Workbook.create();
  workbook.comments.setSelf({ displayName: "Eason" });
  const dashboard = workbook.worksheets.add(config.sheets.dashboard);
  const assumptions = workbook.worksheets.add(config.sheets.assumptions);
  const engineA = workbook.worksheets.add(config.sheets.engineA);
  const engineB = workbook.worksheets.add(config.sheets.engineB);
  const y1 = workbook.worksheets.add(config.sheets.y1);
  const annual = workbook.worksheets.add(config.sheets.annual);
  const cash = workbook.worksheets.add(config.sheets.cash);
  const checks = workbook.worksheets.add(config.sheets.checks);
  const sources = workbook.worksheets.add(config.sheets.sources);

  buildAssumptions(workbook, assumptions, config);
  buildEngine(engineA, config, "A");
  buildEngine(engineB, config, "B");
  buildAnnual(annual, config);
  buildY1(y1, config);
  buildCash(cash, config);
  buildChecks(checks, config);
  buildSources(sources, config);
  buildDashboard(dashboard, config);

  const hardErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 300 },
    summary: `${config.key} V2.1 formula error scan`,
    maxChars: 12000,
  });
  const checksInspect = await workbook.inspect({
    kind: "table",
    sheetId: config.sheets.checks,
    range: "A1:G44",
    include: "values,formulas",
    tableMaxRows: 44,
    tableMaxCols: 7,
    maxChars: 18000,
  });
  const engineInspect = await workbook.inspect({
    kind: "table",
    sheetId: config.sheets.engineA,
    range: "A9:N75",
    include: "values,formulas",
    tableMaxRows: 70,
    tableMaxCols: 14,
    maxChars: 22000,
  });

  for (const sheet of workbook.worksheets.items) {
    const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 0.8, format: "png" });
    const safe = sheet.name.replace(/[\\/:*?"<>|]/g, "_");
    await fs.writeFile(path.join(previewDir, `${config.key}_${safe}.png`), new Uint8Array(await preview.arrayBuffer()));
  }

  const outputPath = path.join(outputDir, config.output);
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);
  results[config.key] = { outputPath, hardErrors: hardErrors.ndjson, checks: checksInspect.ndjson, engine: engineInspect.ndjson };
}

await fs.writeFile(path.join(workDir, "build_results_v21.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  outputs: Object.values(results).map((x) => x.outputPath),
  hardErrors: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.hardErrors])),
}, null, 2));
