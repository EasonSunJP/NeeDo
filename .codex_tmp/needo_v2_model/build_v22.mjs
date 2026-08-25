import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const workDir = path.join(root, ".codex_tmp/needo_v2_model");
const outputDir = path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a");
const previewDir = path.join(workDir, "previews_v22");
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
    output: "NeeDo_3カ年財務モデル_JP_V2.2_2026-08-22_日本語版.xlsx",
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
      version: "V2.2",
      dashboardTitle: "NeeDo 3カ年財務モデル V2.2｜36か月チャネル・人員・従量課金モデル（日本語版）",
      dashboardNote: "更新：2026-08-22｜注文数の単位修正｜最初の6か月は紹介・営業100%｜R&D人員を1名から段階増員｜P&L構成比・説明を追加",
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
      sectionChannel: "2. 店舗獲得チャネル・流失・取引ポリシー",
      sectionScale: "3. 店舗・セラピスト・ユーザー・取引前提",
      sectionRevenue: "4. その他の収益前提",
      sectionCosts: "5. サーバー・R&D・人件費・運営費前提",
      sectionPattern: "6. 月次ランプ・季節配分",
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
      channelDiversificationStart: "自然・広告チャネル開始モデル月",
      launchSalesReferralShare: "開始時の紹介・営業比率",
      launchOrganicShare: "開始時の自然流入・口コミ比率",
      launchAdEventShare: "開始時の広告・イベント比率",
      salesReferralShare: "年末の紹介・営業チャネル比率",
      organicShare: "年末の自然流入・口コミチャネル比率",
      adEventShare: "年末の広告・イベントチャネル比率",
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
      rndStartHeadcount: "R&D開始人員／年",
      rndEndHeadcount: "R&D期末人員／年",
      rndCostPerPerson: "R&D人員フルコスト／人月",
      nonRndPayroll: "R&D以外の人件費／年",
      marketing: "広告・ブランドプロモーション／年",
      bizdev: "事業開発・店舗オンボーディング／年",
      support: "カスタマーサポート・安全・保険固定費／年",
      admin: "管理・その他費用／年",
      storePatternY1: "Y1新規店獲得配分",
      storePatternY2: "Y2新規店獲得配分",
      storePatternY3: "Y3新規店獲得配分",
      productivityRamp: "Y1取引生産性ランプ",
      foreignLaunchPattern: "Y1外国人ユーザー立上げ配分",
      foreignSteadyPattern: "Y2/Y3外国人ユーザー季節配分",
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
      unmetForeignOrders: "供給能力超過の外国人注文需要",
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
      rndCost: "初期プロダクト開発費",
      rndHeadcount: "R&D人員数",
      rndPersonnelCost: "R&D更新・保守・開発人件費",
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
    output: "NeeDo_三年财务模型_CN_V2.2_2026-08-22.xlsx",
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
      version: "V2.2",
      dashboardTitle: "NeeDo 三年财务模型 V2.2｜36个月渠道、人力及用量驱动模型（中文版）",
      dashboardNote: "更新：2026-08-22｜修正订单单位｜前6个月介绍/营业100%｜研发人员由1人逐步增加｜增加P&L占比、参数及增长理由",
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
      sectionChannel: "二、店铺获客渠道、流失及交易政策",
      sectionScale: "三、店铺、技师、用户及交易假设",
      sectionRevenue: "四、其他收入假设",
      sectionCosts: "五、服务器、研发、人力及运营费用假设",
      sectionPattern: "六、月度爬坡及季节分配",
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
      channelDiversificationStart: "自然及广告渠道开始模型月",
      launchSalesReferralShare: "启动时介绍及营业占比",
      launchOrganicShare: "启动时自然流入及口碑占比",
      launchAdEventShare: "启动时广告及活动占比",
      salesReferralShare: "年末介绍及营业渠道占比",
      organicShare: "年末自然流入及口碑渠道占比",
      adEventShare: "年末广告及活动渠道占比",
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
      rndStartHeadcount: "研发年初人数",
      rndEndHeadcount: "研发年末人数",
      rndCostPerPerson: "研发人员全口径成本／人月",
      nonRndPayroll: "非研发人员成本／年",
      marketing: "广告及品牌推广／年",
      bizdev: "商务拓展及店铺导入／年",
      support: "客服、安全及保险固定费／年",
      admin: "行政管理及其他费用／年",
      storePatternY1: "Y1新店签约分配",
      storePatternY2: "Y2新店签约分配",
      storePatternY3: "Y3新店签约分配",
      productivityRamp: "第一年订单生产率爬坡",
      foreignLaunchPattern: "Y1外国用户启动分配",
      foreignSteadyPattern: "Y2/Y3外国用户季节分配",
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
      unmetForeignOrders: "超出供给能力的外国订单需求",
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
      rndCost: "初期产品开发费",
      rndHeadcount: "研发人员数",
      rndPersonnelCost: "研发更新、维护及开发人力成本",
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
  channelDiversificationStart: 19,
  launchSalesReferralShare: 20,
  launchOrganicShare: 21,
  launchAdEventShare: 22,
  salesReferralShare: 23,
  organicShare: 24,
  adEventShare: 25,
  adEventCac: 26,
  storeChurn: 27,
  techChurn: 28,
  userChurn: 29,
  bookingFree: 30,
  bookingFee: 31,
  paymentRate: 32,
  riskPerOrder: 33,
  userRebate: 34,
  weeksPerMonth: 35,
  startingStores: 36,
  eoyStores: 40,
  techPerStore: 41,
  usersPerStore: 42,
  ordersPerTechWeek: 43,
  foreignUsers: 44,
  foreignVisits: 45,
  capacityPerTechWeek: 46,
  s2bShare: 50,
  consumableGmv: 51,
  s2bTake: 52,
  memberConv: 53,
  memberFee: 54,
  douShare: 55,
  douSpend: 56,
  rankingShare: 57,
  rankingSpend: 58,
  advertisers: 59,
  campaigns: 60,
  campaignBudget: 61,
  campaignTake: 62,
  displayArpu: 63,
  hotelOrderShare: 64,
  hotelIncome: 65,
  hotelPayout: 66,
  serverBase: 70,
  serverOrder: 71,
  serverAccount: 72,
  rnd: 73,
  rndStartHeadcount: 74,
  rndEndHeadcount: 75,
  rndCostPerPerson: 76,
  nonRndPayroll: 77,
  marketing: 78,
  bizdev: 79,
  support: 80,
  admin: 81,
  storePatternY1: 85,
  storePatternY2: 86,
  storePatternY3: 87,
  productivityRamp: 88,
  foreignLaunchPattern: 89,
  foreignSteadyPattern: 90,
  fixedCostPattern: 91,
};

const engineRows = {
  plannedStores: 10,
  eligibleChurn: 11,
  churnedStores: 12,
  newStores: 13,
  salesReferralShare: 14,
  organicShare: 15,
  adEventShare: 16,
  salesReferralStores: 17,
  organicStores: 18,
  adEventStores: 19,
  activeStores: 20,
  freeStores: 21,
  chargeableStores: 22,
  activeTechs: 23,
  churnedTechs: 24,
  newTechs: 25,
  localUsers: 26,
  churnedUsers: 27,
  newUsers: 28,
  foreignMau: 29,
  totalMau: 30,
  productivity: 31,
  localOrders: 32,
  foreignOrders: 33,
  totalOrders: 34,
  chargeableRatio: 35,
  chargeableOrders: 36,
  ekycEnabled: 37,
  ekycVolume: 38,
  unmetForeignOrders: 39,
  bookingRevenue: 41,
  storeRevenue: 42,
  s2bRevenue: 43,
  memberRevenue: 44,
  douRevenue: 45,
  rankingRevenue: 46,
  creatorRevenue: 47,
  displayRevenue: 48,
  hotelRevenue: 49,
  totalRevenue: 50,
  rndCost: 53,
  rndHeadcount: 54,
  rndPersonnelCost: 55,
  serverFixed: 56,
  serverOrderCost: 57,
  serverAccountCost: 58,
  serverTotal: 59,
  payrollCost: 60,
  marketingCost: 61,
  bizdevCost: 62,
  supportCost: 63,
  adminCost: 64,
  successFeeCost: 65,
  adEventAcquisitionCost: 66,
  ekycCost: 67,
  riskCost: 68,
  paymentCost: 69,
  userRebateCost: 70,
  hotelCost: 71,
  totalCosts: 72,
  preEkycProfit: 73,
  operatingProfit: 74,
  margin: 75,
  financing: 78,
  openingCash: 79,
  endingCash: 80,
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
  const mainHeader = [
    t.parameter, t.unit, `${t.scenarioA} ${t.y1}`, `${t.scenarioA} ${t.y2}`, `${t.scenarioA} ${t.y3}`,
    `${t.scenarioB} ${t.y1}`, `${t.scenarioB} ${t.y2}`, `${t.scenarioB} ${t.y3}`, t.note,
  ];
  sheet.getRange("A5:I5").values = [mainHeader];
  headerStyle(sheet.getRange("A5:I5"));

  const start = new Date(Date.UTC(2026, 8, 1));
  sheet.getRange("A6:I15").values = [
    [t.startMonth, "date", start, start, start, start, start, start, config.key === "jp" ? "入力値。必要に応じて開始月を変更" : "输入值，可按实际计划修改开始月份"],
    [t.openingCash, "JPY", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "モデル開始前の現金残高" : "模型开始前现金余额"],
    [t.financing, "JPY", 200000000, 0, 0, 200000000, 0, 0, config.key === "jp" ? "各年の初月に計上。Y1は2億円、Y2/Y3は0" : "在各年首月计入；Y1为2亿日元，Y2/Y3为0"],
    [t.ekycEarliest, "model month", 7, 7, 7, 7, 7, 7, config.key === "jp" ? "最初の6か月はeKYCを使用せず、利益条件も満たした翌月から開始" : "前6个月不使用eKYC，并在满足利润条件后的次月启用"],
    [t.ekycUserRatio, "%", 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, config.key === "jp" ? "新規ユーザーのうち本人確認対象となる比率" : "新增用户中需要身份认证的比例"],
    [t.ekycUnit, "JPY/case", 300, 300, 300, 300, 300, 300, config.key === "jp" ? "開始後の新規店舗管理者・技師・対象ユーザーに適用" : "启用后适用于新店管理员、技师及覆盖用户"],
    [t.storeFee, "JPY/store/month", 9800, 9800, 9800, 9800, 9800, 9800, config.key === "jp" ? "契約開始月から月次認識。Booking無料期間とは分離" : "自合同开始月按月确认，与Booking免费期分开"],
    [t.minContract, "month", 6, 6, 6, 6, 6, 6, config.key === "jp" ? "6か月分の前受金なし。6か月以内の解約なし" : "不按6个月预收；6个月内不发生店铺流失"],
    [t.successFee, "JPY/new store", 30000, 30000, 30000, 30000, 30000, 30000, config.key === "jp" ? "紹介・営業経由の契約成立時に1回支払う" : "仅在介绍及营业渠道签约成功时支付一次"],
    [t.successCoverage, "%", 1, 1, 1, 1, 1, 1, config.key === "jp" ? "紹介・営業経由店舗の成功報酬対象比率" : "介绍及营业渠道新店的成功报酬适用比例"],
  ];

  sectionBand(sheet, "A17:I17", t.sectionChannel);
  sheet.getRange("A18:I18").values = [mainHeader];
  headerStyle(sheet.getRange("A18:I18"));
  sheet.getRange("A19:I36").values = [
    [t.channelDiversificationStart, "model month", 7, 7, 7, 7, 7, 7, config.key === "jp" ? "M01〜M06は紹介・営業100%。M07から自然・広告を段階導入" : "M01至M06全部为介绍/营业；M07起逐步加入自然及广告渠道"],
    [t.launchSalesReferralShare, "%", 1, 1, 1, 1, 1, 1, config.key === "jp" ? "A/B共通。最初の6か月に適用" : "A/B相同，适用于最初6个月"],
    [t.launchOrganicShare, "%", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "M07から段階増加" : "自M07起逐步增加"],
    [t.launchAdEventShare, "%", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "M07から段階増加" : "自M07起逐步增加"],
    [t.salesReferralShare, "%", 0.40, 0.15, 0.05, 0.40, 0.15, 0.05, config.key === "jp" ? "各年末比率。紹介依存を段階的に低下" : "各年末比例；逐步降低对介绍及营业的依赖"],
    [t.organicShare, "%", 0.35, 0.60, 0.70, 0.35, 0.60, 0.70, config.key === "jp" ? "各年末比率。口コミ・検索・店舗間紹介の蓄積" : "各年末比例；随口碑、搜索及店铺间推荐积累而提高"],
    [t.adEventShare, "%", 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, config.key === "jp" ? "各年末比率。広告・イベント・提携を継続" : "各年末比例；持续通过广告、活动及联盟获客"],
    [t.adEventCac, "JPY/new store", 15000, 15000, 15000, 15000, 15000, 15000, config.key === "jp" ? "広告・イベント経由店舗の変動獲得費（管理仮定）" : "广告及活动渠道每家新店的变动获客成本（管理假设）"],
    [t.storeChurn, "%/month", 0.01, 0.01, 0.01, 0.008, 0.008, 0.008, config.key === "jp" ? "最低契約期間終了後の月次解約率" : "最低合同期结束后的月度流失率"],
    [t.techChurn, "%/month", 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, config.key === "jp" ? "稼働技師の月次入替。新規採用で補充" : "活跃技师月度流失，由新增技师补充"],
    [t.userChurn, "%/month", 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, config.key === "jp" ? "ローカルMAUの月次離脱。新規獲得で補充" : "本地MAU月度流失，由新增用户补充"],
    [t.bookingFree, "month", 3, 3, 3, 3, 3, 3, config.key === "jp" ? "新規店は最初の3か月のみBooking手数料無料" : "新店最初3个月仅免Booking平台费"],
    [t.bookingFee, "JPY/order", 500, 500, 500, 500, 500, 500, config.key === "jp" ? "無料期間終了後の課金対象取引に適用" : "适用于免费期结束后的收费订单"],
    [t.paymentRate, "%", 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, config.key === "jp" ? "主要な課金収入に対する決済・精算費" : "对主要收费收入计提支付及结算费"],
    [t.riskPerOrder, "JPY/order", 30, 30, 30, 30, 30, 30, config.key === "jp" ? "すべての完了取引に連動" : "按全部完成订单计提"],
    [t.userRebate, "JPY/order", 100, 100, 100, 100, 100, 100, config.key === "jp" ? "完了取引ごとに100 NDP相当を還元" : "每笔完成订单返还100 NDP等值"],
    [t.weeksPerMonth, "week/month", 4, 4, 4, 4, 4, 4, config.key === "jp" ? "年間48週を月4週でモデル化" : "全年48周，按每月4周建模"],
    [t.startingStores, "store", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "既存稼働店がある場合は入力" : "如模型开始时已有活跃店铺，可在此输入"],
  ];

  sectionBand(sheet, "A38:I38", t.sectionScale);
  sheet.getRange("A39:I39").values = [mainHeader];
  headerStyle(sheet.getRange("A39:I39"));
  sheet.getRange("A40:I46").values = [
    [t.eoyStores, "store", 500, 1000, 2000, 1200, 3000, 6000, config.key === "jp" ? "Aは検証的拡大。BはPMF・広告・提携成立を前提とする上振れケース" : "A为验证式扩张；B为形成PMF且广告及联盟有效后的上行情景"],
    [t.techPerStore, "person/store", 10, 10, 10, 10, 10, 10, config.key === "jp" ? "店舗数に応じて月次で増減" : "随店铺数逐月变化"],
    [t.usersPerStore, "MAU/store", 100, 100, 100, 100, 100, 100, config.key === "jp" ? "成熟時のローカルMAU" : "成熟期每店本地MAU"],
    [t.ordersPerTechWeek, "order/person/week", 1, 1, 1, 2, 2, 2, config.key === "jp" ? "プラットフォーム経由完了件数。Y1は生産性ランプを追加" : "平台内完成订单；第一年另乘订单生产率爬坡"],
    [t.foreignUsers, "unique user/year", 22836, 48868, 104578, 228357, 488685, 1045785, config.key === "jp" ? "Y1は供給立上げに合わせて後半へ配分" : "第一年按供给能力爬坡向后半年分配"],
    [t.foreignVisits, "order/user/year", 1, 1, 1, 2, 2, 2, config.key === "jp" ? "年間利用回数" : "年度人均使用次数"],
    [t.capacityPerTechWeek, "order/person/week", 5, 5, 5, 5, 5, 5, config.key === "jp" ? "ローカル＋外国人注文の総処理能力上限" : "本地及外国订单的总履约能力上限"],
  ];

  sectionBand(sheet, "A48:I48", t.sectionRevenue);
  sheet.getRange("A49:I49").values = [mainHeader];
  headerStyle(sheet.getRange("A49:I49"));
  sheet.getRange("A50:I66").values = [
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
    [t.hotelOrderShare, "%", 0, 0, 0, 0, 0, 0, config.key === "jp" ? "契約条件未確定のためV2.2ではコアP&Lから除外" : "商业合同尚未确定，V2.2暂不计入核心P&L"],
    [t.hotelIncome, "JPY/order", 500, 500, 500, 500, 500, 500, config.key === "jp" ? "将来の入力欄。現時点は注文比率0%" : "预留输入；当前订单比例为0%"],
    [t.hotelPayout, "JPY/order", 500, 500, 500, 500, 500, 500, config.key === "jp" ? "将来の入力欄。売上・支出同額による総額膨張を回避" : "预留输入；避免收入及支出同额导致规模虚增"],
  ];

  sectionBand(sheet, "A68:I68", t.sectionCosts);
  sheet.getRange("A69:I69").values = [mainHeader];
  headerStyle(sheet.getRange("A69:I69"));
  sheet.getRange("A70:I81").values = [
    [t.serverBase, "JPY/month", 250000, 250000, 250000, 250000, 250000, 250000, config.key === "jp" ? "リーン初期構成。高可用・専有環境は別途上振れ" : "精益型初期架构；高可用或独占环境需另行上调"],
    [t.serverOrder, "JPY/order", 15, 15, 15, 15, 15, 15, config.key === "jp" ? "API、通知、ログ、キュー等。完了取引数に比例" : "API、通知、日志及队列等，随完成订单增加"],
    [t.serverAccount, "JPY/account/month", 10, 10, 10, 10, 10, 10, config.key === "jp" ? "店舗・技師・MAUの保存、検索、配信等" : "店铺、技师及MAU的存储、搜索及推送"],
    [t.rnd, "JPY/once", 20000000, 0, 0, 20000000, 0, 0, config.key === "jp" ? "初期開発費2,000万円をM01に一括計上" : "初期开发费2,000万日元仅在M01一次性计入"],
    [t.rndStartHeadcount, "person", 1, 3, 6, 1, 5, 10, config.key === "jp" ? "各年の開始人員。前年末と接続" : "各年起始人数，与上一年末衔接"],
    [t.rndEndHeadcount, "person", 3, 6, 10, 5, 10, 15, config.key === "jp" ? "A: 1→3→6→10名、B: 1→5→10→15名" : "A：1→3→6→10人；B：1→5→10→15人"],
    [t.rndCostPerPerson, "JPY/person/month", 700000, 700000, 700000, 700000, 700000, 700000, config.key === "jp" ? "給与・会社負担・採用・機器・開発ツールを含む管理フルコスト" : "含工资、公司负担、招聘、设备及开发工具的管理全口径成本"],
    [t.nonRndPayroll, "JPY/year", 12000000, 22000000, 45000000, 35000000, 65000000, 95000000, config.key === "jp" ? "R&D以外の人件費" : "不含研发的人力成本"],
    [t.marketing, "JPY/year", 6000000, 12000000, 24000000, 36000000, 72000000, 144000000, config.key === "jp" ? "消費者向けブランド・需要喚起。店舗獲得費は別科目" : "面向用户的品牌及需求激活；店铺获客成本单列"],
    [t.bizdev, "JPY/year", 5000000, 10000000, 22000000, 18000000, 36000000, 72000000, config.key === "jp" ? "チャネル開拓、提携、店舗導入支援" : "渠道拓展、合作联盟及店铺上线支持"],
    [t.support, "JPY/year", 4000000, 7000000, 20000000, 12000000, 30000000, 70000000, config.key === "jp" ? "CS、安全、固定保険。利用規模に応じて増額" : "客服、安全及固定保险，随使用规模增加"],
    [t.admin, "JPY/year", 5000000, 9000000, 24000000, 12000000, 24000000, 45000000, config.key === "jp" ? "財税、法務、オフィス、共通ソフト等" : "财税、法务、办公及通用软件等"],
  ];

  sectionBand(sheet, "A83:N83", t.sectionPattern);
  sheet.getRange("A84:N84").values = [[t.parameter, t.unit, ...Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`)]];
  headerStyle(sheet.getRange("A84:N84"));
  const storePatternY1 = [0.025, 0.03, 0.04, 0.055, 0.07, 0.085, 0.10, 0.11, 0.115, 0.12, 0.125, 0.125];
  const storePatternLater = [0.06, 0.065, 0.07, 0.075, 0.08, 0.08, 0.085, 0.085, 0.09, 0.09, 0.10, 0.12];
  const productivity = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.00];
  const foreignLaunch = [0.01, 0.015, 0.025, 0.04, 0.06, 0.08, 0.10, 0.11, 0.12, 0.13, 0.14, 0.17];
  const foreignSteady = [0.07, 0.07, 0.08, 0.08, 0.09, 0.09, 0.09, 0.09, 0.08, 0.08, 0.09, 0.09];
  const fixedPattern = Array(12).fill(1 / 12);
  sheet.getRange("A85:N91").values = [
    [t.storePatternY1, "%", ...storePatternY1],
    [t.storePatternY2, "%", ...storePatternLater],
    [t.storePatternY3, "%", ...storePatternLater],
    [t.productivityRamp, "%", ...productivity],
    [t.foreignLaunchPattern, "%", ...foreignLaunch],
    [t.foreignSteadyPattern, "%", ...foreignSteady],
    [t.fixedCostPattern, "%", ...fixedPattern],
  ];
  sheet.getRange("A92:B99").values = [
    [config.key === "jp" ? "Y1店舗配分合計" : "Y1店铺分配合计", "%"],
    [config.key === "jp" ? "Y2店舗配分合計" : "Y2店铺分配合计", "%"],
    [config.key === "jp" ? "Y3店舗配分合計" : "Y3店铺分配合计", "%"],
    [config.key === "jp" ? "Y1外国人配分合計" : "Y1外国用户分配合计", "%"],
    [config.key === "jp" ? "Y2/Y3外国人配分合計" : "Y2/Y3外国用户分配合计", "%"],
    [config.key === "jp" ? "固定費配分合計" : "固定费用分配合计", "%"],
    [config.key === "jp" ? "チャネル開始ロジック" : "渠道启动逻辑", "text"],
    [config.key === "jp" ? "eKYC開始ロジック" : "eKYC启用逻辑", "text"],
  ];
  const patternCheckRows = [assumptionRows.storePatternY1, assumptionRows.storePatternY2, assumptionRows.storePatternY3, assumptionRows.foreignLaunchPattern, assumptionRows.foreignSteadyPattern, assumptionRows.fixedCostPattern];
  for (let i = 0; i < patternCheckRows.length; i++) sheet.getRange(`C${92 + i}`).formulas = [[`=SUM(C${patternCheckRows[i]}:N${patternCheckRows[i]})`]];
  sheet.getRange("C98:N98").merge();
  sheet.getRange("C98").values = [[config.key === "jp" ? "M01〜M06は紹介・営業100%。M07から各年末比率へ月次で滑らかに移行。A/B共通。" : "M01至M06介绍/营业为100%；M07起按月平滑过渡至各年末比例，A/B相同。"]];
  sheet.getRange("C99:N99").merge();
  sheet.getRange("C99").values = [[config.key === "jp" ? "最短開始月以降、前月のeKYC前営業利益がプラスになった翌月から開始。" : "达到最早月份后，仅在上月eKYC前营业利润为正时于次月启用。"]];

  for (const address of ["C6:H15", "C19:H36", "C40:H46", "C50:H66", "C70:H81", "C85:N91"]) styleInput(sheet.getRange(address));
  sheet.getRange("C6:H6").format.numberFormat = fmt.date;
  for (const row of [10, 15, 20, 21, 22, 23, 24, 25, 27, 28, 29, 32, 50, 52, 53, 55, 57, 62, 64]) sheet.getRange(`C${row}:H${row}`).format.numberFormat = fmt.pct;
  sheet.getRange("C85:N91").format.numberFormat = fmt.pct;
  sheet.getRange("C92:C97").format.numberFormat = fmt.pct;
  sheet.getRange("C92:C97").format.font = { color: colors.black, bold: true };

  for (const address of ["A6:I15", "A19:I36", "A40:I46", "A50:I66", "A70:I81", "A85:N99"]) bodyBorders(sheet.getRange(address));
  sheet.getRange("A6:A99").format.wrapText = true;
  sheet.getRange("I6:I81").format.wrapText = true;
  sheet.getRange("A1:N99").format.font = { name: "Arial", size: 10 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.getRange("A:A").format.columnWidth = 36;
  sheet.getRange("B:B").format.columnWidth = 20;
  sheet.getRange("C:H").format.columnWidth = 14;
  sheet.getRange("I:I").format.columnWidth = 56;
  sheet.getRange("J:N").format.columnWidth = 12;
  sheet.freezePanes.freezeRows(5);
  sheet.freezePanes.freezeColumns(2);
  sheet.showGridLines = false;

  workbook.comments.addThread({ cell: sheet.getRange("C12") }, config.key === "jp" ? "ユーザー指定：全店舗から月額9,800円。契約開始月から月次認識。" : "用户要求：每家店铺每月9,800日元，自合同开始月按月确认。");
  workbook.comments.addThread({ cell: sheet.getRange("C13") }, config.key === "jp" ? "ユーザー指定：最低契約6か月。6か月分の前受金なし。" : "用户要求：最低合同期6个月，不按6个月一次性预收。");
  workbook.comments.addThread({ cell: sheet.getRange("C14") }, config.key === "jp" ? "紹介・営業経由の新規契約1店につき30,000円。" : "介绍及营业渠道每成功签约一家新店支付30,000日元。");
  workbook.comments.addThread({ cell: sheet.getRange("C19") }, config.key === "jp" ? "ユーザー指定：最初の6か月は紹介・営業100%。M07から自然・広告を導入。" : "用户指定：前6个月全部来自介绍及营业，M07起加入自然及广告活动渠道。");
  workbook.comments.addThread({ cell: sheet.getRange("C70") }, config.key === "jp" ? "固定25万円/月＋注文・アカウント従量。" : "固定25万日元/月，加订单及活跃账户用量费用。");
  workbook.comments.addThread({ cell: sheet.getRange("C73") }, config.key === "jp" ? "初期開発費2,000万円はM01のみ。継続R&D人件費は別行。" : "初期开发费2,000万日元仅计M01；持续研发人力成本另行计算。");
  workbook.comments.addThread({ cell: sheet.getRange("C76") }, config.key === "jp" ? "厚労省job tagのWebサービスSE給与レンジを参考に、会社負担・採用・機器等を加えた管理フルコスト。" : "参考厚生劳动省job tag的Web服务工程师薪酬区间，并加入公司负担、招聘及设备等管理成本。");
  workbook.comments.addThread({ cell: sheet.getRange("F40") }, config.key === "jp" ? "BはY1 1,200店、Y2 3,000店、Y3 6,000店。PMF・広告・提携成立が条件。" : "B方案为Y1 1,200家、Y2 3,000家、Y3 6,000家；以形成PMF且广告及联盟有效为前提。");
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
    [t.salesReferralShare, "%"], [t.organicShare, "%"], [t.adEventShare, "%"],
    [t.salesReferralStores, "store"], [t.organicStores, "store"], [t.adEventStores, "store"],
    [t.activeStores, "store"], [t.freeStores, "store"], [t.chargeableStores, "store"], [t.activeTechs, "person"],
    [t.churnedTechs, "person"], [t.newTechs, "person"], [t.localUsers, "MAU"], [t.churnedUsers, "MAU"],
    [t.newUsers, "MAU"], [t.foreignMau, "MAU"], [t.totalMau, "MAU"], [t.productivity, "%"],
    [t.localOrders, "order"], [t.foreignOrders, "order"], [t.totalOrders, "order"], [t.chargeableRatio, "%"],
    [t.chargeableOrders, "order"], [t.ekycEnabled, "0/1"], [t.ekycVolume, "case"], [t.unmetForeignOrders, "order"],
  ];
  sheet.getRange("A10:B39").values = driverLabels;
  sectionBand(sheet, "A40:AL40", t.revenue);
  const revenueLabels = [
    [t.bookingRevenue, "JPY"], [t.storeRevenue, "JPY"], [t.s2bRevenue, "JPY"], [t.memberRevenue, "JPY"],
    [t.douRevenue, "JPY"], [t.rankingRevenue, "JPY"], [t.creatorRevenue, "JPY"], [t.displayRevenue, "JPY"],
    [t.hotelRevenue, "JPY"], [t.totalRevenue, "JPY"],
  ];
  sheet.getRange("A41:B50").values = revenueLabels;
  sectionBand(sheet, "A52:AL52", t.costs);
  const costLabels = [
    [t.rndCost, "JPY"], [t.rndHeadcount, "person"], [t.rndPersonnelCost, "JPY"],
    [t.serverFixed, "JPY"], [t.serverOrderCost, "JPY"], [t.serverAccountCost, "JPY"], [t.serverTotal, "JPY"],
    [t.payrollCost, "JPY"], [t.marketingCost, "JPY"], [t.bizdevCost, "JPY"], [t.supportCost, "JPY"], [t.adminCost, "JPY"],
    [t.successFeeCost, "JPY"], [t.adEventAcquisitionCost, "JPY"], [t.ekycCost, "JPY"], [t.riskCost, "JPY"], [t.paymentCost, "JPY"], [t.userRebateCost, "JPY"],
    [t.hotelCost, "JPY"], [t.totalCosts, "JPY"], [t.preEkycProfit, "JPY"], [t.operatingProfit, "JPY"], [t.margin, "%"],
  ];
  sheet.getRange("A53:B75").values = costLabels;
  sectionBand(sheet, "A77:AL77", t.cashSection);
  sheet.getRange("A78:B80").values = [[t.financing, "JPY"], [t.openingCashLabel, "JPY"], [t.endingCash, "JPY"]];

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

    const storePatternRow = year === 1 ? assumptionRows.storePatternY1 : year === 2 ? assumptionRows.storePatternY2 : assumptionRows.storePatternY3;
    const foreignPatternRow = year === 1 ? assumptionRows.foreignLaunchPattern : assumptionRows.foreignSteadyPattern;
    sheet.getRange(`${col}${engineRows.plannedStores}`).formulas = [[`=${priorTarget}+(${currentTarget}-${priorTarget})*SUM('${sheets.assumptions}'!$C$${storePatternRow}:'${sheets.assumptions}'!$${patternCol}$${storePatternRow})`]];
    if (i === 0) {
      sheet.getRange(`${col}${engineRows.eligibleChurn}`).formulas = [["=0"]];
    } else {
      sheet.getRange(`${col}${engineRows.eligibleChurn}`).formulas = [[`=IF(${col}$8<=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.minContract)},0,MAX(0,${prevActive}-SUMIFS($C$${engineRows.newStores}:${prevCol}$${engineRows.newStores},$C$8:${prevCol}$8,">"&${col}$8-${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.minContract)})))`]];
    }
    sheet.getRange(`${col}${engineRows.churnedStores}`).formulas = [[`=${col}${engineRows.eligibleChurn}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.storeChurn)}`]];
    sheet.getRange(`${col}${engineRows.newStores}`).formulas = [[`=MAX(0,${col}${engineRows.plannedStores}-${prevActive}+${col}${engineRows.churnedStores})`]];
    for (const [engineRow, launchRow, endRow] of [
      [engineRows.salesReferralShare, assumptionRows.launchSalesReferralShare, assumptionRows.salesReferralShare],
      [engineRows.organicShare, assumptionRows.launchOrganicShare, assumptionRows.organicShare],
      [engineRows.adEventShare, assumptionRows.launchAdEventShare, assumptionRows.adEventShare],
    ]) {
      let shareFormula;
      if (year === 1) {
        const launch = assumptionRef(sheets.assumptions, scenario, 1, launchRow);
        const yearEnd = assumptionRef(sheets.assumptions, scenario, 1, endRow);
        const startMonth = assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.channelDiversificationStart);
        shareFormula = `=IF(${col}$8<${startMonth},${launch},${launch}+(${yearEnd}-${launch})*(${col}$7-${startMonth}+1)/(12-${startMonth}+1))`;
      } else {
        const priorEnd = assumptionRef(sheets.assumptions, scenario, year - 1, endRow);
        const yearEnd = assumptionRef(sheets.assumptions, scenario, year, endRow);
        shareFormula = `=${priorEnd}+(${yearEnd}-${priorEnd})*${col}$7/12`;
      }
      sheet.getRange(`${col}${engineRow}`).formulas = [[shareFormula]];
    }
    sheet.getRange(`${col}${engineRows.salesReferralStores}`).formulas = [[`=${col}${engineRows.newStores}*${col}${engineRows.salesReferralShare}`]];
    sheet.getRange(`${col}${engineRows.organicStores}`).formulas = [[`=${col}${engineRows.newStores}*${col}${engineRows.organicShare}`]];
    sheet.getRange(`${col}${engineRows.adEventStores}`).formulas = [[`=${col}${engineRows.newStores}*${col}${engineRows.adEventShare}`]];
    sheet.getRange(`${col}${engineRows.activeStores}`).formulas = [[`=${prevActive}+${col}${engineRows.newStores}-${col}${engineRows.churnedStores}`]];
    sheet.getRange(`${col}${engineRows.freeStores}`).formulas = [[`=SUMIFS($C$${engineRows.newStores}:${col}$${engineRows.newStores},$C$8:${col}$8,">"&${col}$8-${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.bookingFree)},$C$8:${col}$8,"<="&${col}$8)`]];
    sheet.getRange(`${col}${engineRows.chargeableStores}`).formulas = [[`=MAX(0,${col}${engineRows.activeStores}-${col}${engineRows.freeStores})`]];
    sheet.getRange(`${col}${engineRows.activeTechs}`).formulas = [[`=${col}${engineRows.activeStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.techPerStore)}`]];
    sheet.getRange(`${col}${engineRows.churnedTechs}`).formulas = [[`=${prevTech}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.techChurn)}`]];
    sheet.getRange(`${col}${engineRows.newTechs}`).formulas = [[`=MAX(0,${col}${engineRows.activeTechs}-${prevTech}+${col}${engineRows.churnedTechs})`]];
    sheet.getRange(`${col}${engineRows.localUsers}`).formulas = [[`=${col}${engineRows.activeStores}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.usersPerStore)}`]];
    sheet.getRange(`${col}${engineRows.churnedUsers}`).formulas = [[`=${prevUsers}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.userChurn)}`]];
    sheet.getRange(`${col}${engineRows.newUsers}`).formulas = [[`=MAX(0,${col}${engineRows.localUsers}-${prevUsers}+${col}${engineRows.churnedUsers})`]];
    sheet.getRange(`${col}${engineRows.foreignMau}`).formulas = [[`=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignUsers)}*'${sheets.assumptions}'!$${patternCol}$${foreignPatternRow}`]];
    sheet.getRange(`${col}${engineRows.totalMau}`).formulas = [[`=${col}${engineRows.localUsers}+${col}${engineRows.foreignMau}`]];
    sheet.getRange(`${col}${engineRows.productivity}`).formulas = [[year === 1 ? `='${sheets.assumptions}'!$${patternCol}$${assumptionRows.productivityRamp}` : "=1"]];
    sheet.getRange(`${col}${engineRows.localOrders}`).formulas = [[`=${col}${engineRows.activeTechs}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ordersPerTechWeek)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.weeksPerMonth)}*${col}${engineRows.productivity}`]];
    sheet.getRange(`${col}${engineRows.foreignOrders}`).formulas = [[`=MIN(${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignUsers)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignVisits)}*'${sheets.assumptions}'!$${patternCol}$${foreignPatternRow},MAX(0,${col}${engineRows.activeTechs}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.capacityPerTechWeek)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.weeksPerMonth)}-${col}${engineRows.localOrders}))`]];
    sheet.getRange(`${col}${engineRows.totalOrders}`).formulas = [[`=${col}${engineRows.localOrders}+${col}${engineRows.foreignOrders}`]];
    sheet.getRange(`${col}${engineRows.chargeableRatio}`).formulas = [[`=IF(${col}${engineRows.activeStores}=0,0,${col}${engineRows.chargeableStores}/${col}${engineRows.activeStores})`]];
    sheet.getRange(`${col}${engineRows.chargeableOrders}`).formulas = [[`=${col}${engineRows.totalOrders}*${col}${engineRows.chargeableRatio}`]];
    if (i === 0) {
      sheet.getRange(`${col}${engineRows.ekycEnabled}`).formulas = [["=0"]];
    } else {
      sheet.getRange(`${col}${engineRows.ekycEnabled}`).formulas = [[`=IF(${col}$8<${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ekycEarliest)},0,IF(${prevCol}${engineRows.ekycEnabled}=1,1,IF(${prevCol}${engineRows.preEkycProfit}>0,1,0)))`]];
    }
    sheet.getRange(`${col}${engineRows.ekycVolume}`).formulas = [[`=${col}${engineRows.ekycEnabled}*(${col}${engineRows.newStores}+${col}${engineRows.newTechs}+(${col}${engineRows.newUsers}+${col}${engineRows.foreignMau})*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.ekycUserRatio)})`]];
    sheet.getRange(`${col}${engineRows.unmetForeignOrders}`).formulas = [[`=MAX(0,${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignUsers)}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.foreignVisits)}*'${sheets.assumptions}'!$${patternCol}$${foreignPatternRow}-${col}${engineRows.foreignOrders})`]];

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
    sheet.getRange(`${col}${engineRows.rndHeadcount}`).formulas = [[`=ROUND(${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rndStartHeadcount)}+(${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rndEndHeadcount)}-${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rndStartHeadcount)})*(${col}$7-1)/11,0)`]];
    sheet.getRange(`${col}${engineRows.rndPersonnelCost}`).formulas = [[`=${col}${engineRows.rndHeadcount}*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rndCostPerPerson)}`]];
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
    sheet.getRange(`${col}${engineRows.totalCosts}`).formulas = [[`=SUM(${col}${engineRows.rndCost},${col}${engineRows.rndPersonnelCost},${col}${engineRows.serverTotal}:${col}${engineRows.hotelCost})`]];
    sheet.getRange(`${col}${engineRows.preEkycProfit}`).formulas = [[`=${col}${engineRows.totalRevenue}-${col}${engineRows.totalCosts}+${col}${engineRows.ekycCost}`]];
    sheet.getRange(`${col}${engineRows.operatingProfit}`).formulas = [[`=${col}${engineRows.totalRevenue}-${col}${engineRows.totalCosts}`]];
    sheet.getRange(`${col}${engineRows.margin}`).formulas = [[`=IF(${col}${engineRows.totalRevenue}=0,0,${col}${engineRows.operatingProfit}/${col}${engineRows.totalRevenue})`]];
    sheet.getRange(`${col}${engineRows.financing}`).formulas = [[`=IF(${col}$7=1,${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.financing)},0)`]];
    sheet.getRange(`${col}${engineRows.openingCash}`).formulas = [[i === 0 ? `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.openingCash)}` : `=${prevCol}${engineRows.endingCash}`]];
    sheet.getRange(`${col}${engineRows.endingCash}`).formulas = [[`=${col}${engineRows.openingCash}+${col}${engineRows.operatingProfit}+${col}${engineRows.financing}`]];
  }

  sheet.getRange("C10:AL80").format.font = { color: colors.linkGreen };
  sheet.getRange("C10:AL80").format.numberFormat = fmt.one;
  for (const row of [engineRows.salesReferralShare, engineRows.organicShare, engineRows.adEventShare]) sheet.getRange(`C${row}:AL${row}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.productivity}:AL${engineRows.productivity}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.chargeableRatio}:AL${engineRows.chargeableRatio}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.ekycEnabled}:AL${engineRows.ekycEnabled}`).format.numberFormat = "0";
  sheet.getRange(`C${engineRows.bookingRevenue}:AL${engineRows.totalRevenue}`).format.numberFormat = fmt.raw;
  sheet.getRange(`C${engineRows.rndCost}:AL${engineRows.rndCost}`).format.numberFormat = fmt.raw;
  sheet.getRange(`C${engineRows.rndPersonnelCost}:AL${engineRows.operatingProfit}`).format.numberFormat = fmt.raw;
  sheet.getRange(`C${engineRows.margin}:AL${engineRows.margin}`).format.numberFormat = fmt.pct;
  sheet.getRange(`C${engineRows.financing}:AL${engineRows.endingCash}`).format.numberFormat = fmt.raw;
  sheet.getRange("A10:B80").format.wrapText = true;
  bodyBorders(sheet.getRange("A10:AL39"));
  bodyBorders(sheet.getRange("A41:AL50"));
  bodyBorders(sheet.getRange("A53:AL75"));
  bodyBorders(sheet.getRange("A78:AL80"));
  for (const row of [engineRows.activeStores, engineRows.totalOrders, engineRows.totalRevenue, engineRows.serverTotal, engineRows.totalCosts, engineRows.preEkycProfit, engineRows.operatingProfit, engineRows.endingCash]) {
    styleTotal(sheet, `A${row}:AL${row}`);
  }
  sheet.getRange("A1:AL80").format.font = { name: "Arial", size: 9 };
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
  titleBand(sheet, "A1:P1", t.annualTitle);
  noteBand(sheet, "A2:P2", config.key === "jp" ? "件数・人数は実数表示。金額は百万円。構成比は各売上／売上高合計、各費用／運営費用合計。eKYCは各年度の稼働月数です。" : "订单及人数按实际数量显示，金额为百万日元；占比为各项收入/总收入、各项支出/总支出；eKYC显示各年度启用月数。" );
  const valueHeaders = [`${t.scenarioA} ${t.y1}`, `${t.scenarioA} ${t.y2}`, `${t.scenarioA} ${t.y3}`, `${t.scenarioB} ${t.y1}`, `${t.scenarioB} ${t.y2}`, `${t.scenarioB} ${t.y3}`];
  const pctHeaders = valueHeaders.map((x) => `${x} %`);
  sheet.getRange("A4:P4").values = [[t.parameter, t.unit, ...valueHeaders, ...pctHeaders, config.key === "jp" ? "パラメータ説明" : "参数说明", config.key === "jp" ? "成長理由・判断" : "增长理由/判断"]];
  headerStyle(sheet.getRange("A4:P4"));
  const jp = config.key === "jp";
  const rows = [
    { row: 5, label: t.activeStores, unit: "store", er: engineRows.activeStores, mode: "end", desc: jp ? "各年12月末の稼働店舗数" : "各年12月末活跃店铺数", reason: jp ? "Aは検証的拡大、BはPMF成立後の条件付き上振れ" : "A为验证式扩张，B为形成PMF后的条件性上行情景" },
    { row: 6, label: jp ? "年平均稼働店舗数" : "年平均活跃店铺数", unit: "store", er: engineRows.activeStores, mode: "avg", desc: jp ? "12か月の月末稼働店舗数の平均" : "12个月月末活跃店铺数平均", reason: jp ? "新規獲得配分と最低6か月契約後の解約を反映" : "反映新店获取节奏及最低6个月合同期后的流失" },
    { row: 7, label: t.activeTechs, unit: "person", er: engineRows.activeTechs, mode: "end", desc: jp ? "年末店舗数×1店当たりセラピスト数" : "年末店铺数×每店技师数", reason: jp ? "店舗供給の増加に比例" : "随店铺供给同比增长" },
    { row: 8, label: t.totalMau, unit: "MAU", er: engineRows.totalMau, mode: "end", desc: jp ? "ローカルMAUと外国人月間ユーザーの合計" : "本地MAU与外国用户月度人数合计", reason: jp ? "店舗供給・口コミ・広告の蓄積に連動" : "随店铺供给、口碑及广告积累增长" },
    { row: 9, label: t.totalOrders, unit: "order", er: engineRows.totalOrders, mode: "sumCount", desc: jp ? "年間の完了取引件数。百万円換算しない" : "全年完成订单数，不除以100万", reason: jp ? "店舗・セラピスト数と生産性ランプに連動" : "随店铺、技师数量及订单生产率爬坡" },
    { row: 10, label: jp ? "eKYC稼働月数" : "eKYC启用月数", unit: "month/year", er: engineRows.ekycEnabled, mode: "sumFlag", desc: jp ? "当該年度にeKYCが有効な月数（0〜12）" : "该年度eKYC启用月数（0至12）", reason: jp ? "最短M07以降、前月のeKYC前営業利益が黒字の翌月に開始" : "最早M07后，在上月eKYC前营业利润为正的次月启用" },
    { row: 11, label: t.unmetForeignOrders, unit: "order", er: engineRows.unmetForeignOrders, mode: "sumCount", desc: jp ? "需要がセラピスト供給能力を超えた注文数" : "外国订单需求超过技师履约容量的数量", reason: jp ? "Y1需要を供給立上げに合わせて後半へ配分し抑制" : "Y1需求按供给爬坡后置，以减少容量缺口" },
    { row: 12, label: t.rndHeadcount, unit: "person", er: engineRows.rndHeadcount, mode: "end", desc: jp ? "各年12月末のR&D人員数" : "各年12月末研发人数", reason: jp ? "Aは1→3→6→10名、Bは1→5→10→15名へ増員" : "A按1→3→6→10人，B按1→5→10→15人扩张" },

    { row: 15, label: t.bookingRevenue, unit: "JPY m", er: engineRows.bookingRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "無料期終了後の課金対象注文×500円" : "免费期结束后的收费订单×500日元", reason: jp ? "課金対象店舗と注文数の増加" : "随收费店铺及订单增加" },
    { row: 16, label: t.storeRevenue, unit: "JPY m", er: engineRows.storeRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "全稼働店舗×月額9,800円" : "全部活跃店铺×月费9,800日元", reason: jp ? "契約開始月から毎月認識、6か月一括前受なし" : "合同开始月起按月确认，不一次预收6个月" },
    { row: 17, label: t.s2bRevenue, unit: "JPY m", er: engineRows.s2bRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "対象注文×消耗品GMV×10%" : "适用订单×耗材GMV×10%", reason: jp ? "Y2以降の調達機能導入を仮定" : "假设Y2起上线采购功能" },
    { row: 18, label: t.memberRevenue, unit: "JPY m", er: engineRows.memberRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "ローカルMAU×会員転換率×980円" : "本地MAU×会员转化率×980日元", reason: jp ? "Y2以降、継続利用者の有料化" : "Y2起将持续使用者转化为付费会员" },
    { row: 19, label: t.douRevenue, unit: "JPY m", er: engineRows.douRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "課金店舗向け短時間トラフィック商品" : "面向收费店铺的短时流量产品", reason: jp ? "Y2以降、店舗母数と利用率の上昇" : "Y2起随店铺基数及使用率增加" },
    { row: 20, label: t.rankingRevenue, unit: "JPY m", er: engineRows.rankingRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "有料店舗向け入札ランキング" : "面向付费店铺的竞价排名", reason: jp ? "十分な店舗密度を前提にY3開始" : "在店铺密度形成后于Y3上线" },
    { row: 21, label: t.creatorRevenue, unit: "JPY m", er: engineRows.creatorRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "広告主キャンペーン予算×撮合手数料" : "广告主活动预算×平台撮合费率", reason: jp ? "ブランド認知形成後のY3から" : "品牌认知形成后自Y3开始" },
    { row: 22, label: t.displayRevenue, unit: "JPY m", er: engineRows.displayRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "MAU×年間広告ARPU" : "MAU×年度展示广告ARPU", reason: jp ? "十分なトラフィック規模を前提にY3開始" : "以达到足够流量规模为前提自Y3开始" },
    { row: 23, label: t.hotelRevenue, unit: "JPY m", er: engineRows.hotelRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "ホテル共同予約の将来入力欄" : "酒店联合预约的预留输入", reason: jp ? "契約条件未確定のためV2.2は0" : "合同条件未确定，V2.2设为0" },
    { row: 24, label: t.totalRevenue, unit: "JPY m", er: engineRows.totalRevenue, mode: "sumMoney", category: "revenue", desc: jp ? "上記売上科目の合計" : "上述收入项目合计", reason: jp ? "店舗・注文・MAUの拡大と機能追加" : "随店铺、订单、MAU增长及功能扩展" },

    { row: 27, label: t.rndCost, unit: "JPY m", er: engineRows.rndCost, mode: "sumMoney", category: "expense", desc: jp ? "初期プロダクト開発費2,000万円" : "初期产品开发费2,000万日元", reason: jp ? "M01のみ一括計上" : "仅在M01一次性计入" },
    { row: 28, label: t.rndPersonnelCost, unit: "JPY m", er: engineRows.rndPersonnelCost, mode: "sumMoney", category: "expense", desc: jp ? "R&D人数×70万円／人月" : "研发人数×70万日元/人月", reason: jp ? "更新・保守・新機能・規模対応のため段階増員" : "为更新、维护、新功能及规模扩张逐步增员" },
    { row: 29, label: t.serverTotal, unit: "JPY m", er: engineRows.serverTotal, mode: "sumMoney", category: "expense", desc: jp ? "月25万円＋注文15円＋稼働アカウント10円" : "每月25万日元+每单15日元+每活跃账户10日元", reason: jp ? "初期固定基盤を抑え、利用量に応じて増加" : "降低初期固定基线，随使用量增长" },
    { row: 30, label: t.payrollCost, unit: "JPY m", er: engineRows.payrollCost, mode: "sumMoney", category: "expense", desc: jp ? "R&D以外の人件費" : "非研发人员成本", reason: jp ? "営業・運営機能を事業規模に合わせ増員" : "销售及运营人员随业务规模增加" },
    { row: 31, label: t.marketingCost, unit: "JPY m", er: engineRows.marketingCost, mode: "sumMoney", category: "expense", desc: jp ? "ユーザー向け広告・ブランド施策" : "面向用户的广告及品牌推广", reason: jp ? "自然流入を補完し需要密度を高める" : "补充自然流量并提高需求密度" },
    { row: 32, label: t.bizdevCost, unit: "JPY m", er: engineRows.bizdevCost, mode: "sumMoney", category: "expense", desc: jp ? "提携・店舗導入・営業運営費" : "合作、店铺导入及商务运营费", reason: jp ? "直接紹介依存を下げつつ提携を拡大" : "降低直接介绍依赖，同时扩大合作渠道" },
    { row: 33, label: t.supportCost, unit: "JPY m", er: engineRows.supportCost, mode: "sumMoney", category: "expense", desc: jp ? "CS、安全、固定保険" : "客服、安全及固定保险", reason: jp ? "注文・店舗・ユーザー増加に合わせ拡充" : "随订单、店铺及用户增长扩充" },
    { row: 34, label: t.adminCost, unit: "JPY m", er: engineRows.adminCost, mode: "sumMoney", category: "expense", desc: jp ? "財税・法務・オフィス等" : "财税、法务、办公等", reason: jp ? "組織規模と管理要件に応じて増加" : "随组织规模及管理要求增加" },
    { row: 35, label: t.successFeeCost, unit: "JPY m", er: engineRows.successFeeCost, mode: "sumMoney", category: "expense", desc: jp ? "紹介・営業経由の新店×3万円" : "介绍/营业渠道新店×3万日元", reason: jp ? "M01〜M06は100%、その後チャネル比率低下" : "M01至M06为100%，之后随渠道占比下降" },
    { row: 36, label: t.adEventAcquisitionCost, unit: "JPY m", er: engineRows.adEventAcquisitionCost, mode: "sumMoney", category: "expense", desc: jp ? "広告・イベント経由新店×1.5万円" : "广告/活动渠道新店×1.5万日元", reason: jp ? "M07から広告・イベント流入を段階導入" : "M07起逐步引入广告及活动流量" },
    { row: 37, label: t.ekycCost, unit: "JPY m", er: engineRows.ekycCost, mode: "sumMoney", category: "expense", desc: jp ? "eKYC対象件数×300円" : "eKYC适用数量×300日元", reason: jp ? "最短M07かつ利益証明後のみ開始" : "最早M07且证明盈利后才启用" },
    { row: 38, label: t.riskCost, unit: "JPY m", er: engineRows.riskCost, mode: "sumMoney", category: "expense", desc: jp ? "全完了取引×30円" : "全部完成订单×30日元", reason: jp ? "取引量に比例" : "随订单量同比增长" },
    { row: 39, label: t.paymentCost, unit: "JPY m", er: engineRows.paymentCost, mode: "sumMoney", category: "expense", desc: jp ? "主要課金収入×3%" : "主要收费收入×3%", reason: jp ? "有料売上に比例" : "随付费收入同比增长" },
    { row: 40, label: t.userRebateCost, unit: "JPY m", er: engineRows.userRebateCost, mode: "sumMoney", category: "expense", desc: jp ? "全完了取引×100円" : "全部完成订单×100日元", reason: jp ? "注文数に比例する利用促進費" : "随订单量增长的用户激励成本" },
    { row: 41, label: t.hotelCost, unit: "JPY m", er: engineRows.hotelCost, mode: "sumMoney", category: "expense", desc: jp ? "ホテル共同予約の将来支払欄" : "酒店联合预约的预留支出", reason: jp ? "契約条件未確定のためV2.2は0" : "合同条件未确定，V2.2设为0" },
    { row: 42, label: t.totalCosts, unit: "JPY m", er: engineRows.totalCosts, mode: "sumMoney", category: "expense", desc: jp ? "上記費用科目の合計" : "上述支出项目合计", reason: jp ? "R&D人員、運営体制、利用量の増加" : "随研发人员、运营体系及使用量增长" },

    { row: 44, label: t.preEkycProfit, unit: "JPY m", er: engineRows.preEkycProfit, mode: "sumMoney", desc: jp ? "eKYC費用を控除する前の営業利益" : "扣除eKYC费用前的营业利润", reason: jp ? "eKYC開始条件の判定に使用" : "用于判断eKYC启用条件" },
    { row: 45, label: t.operatingProfit, unit: "JPY m", er: engineRows.operatingProfit, mode: "sumMoney", desc: jp ? "売上高合計－運営費用合計" : "总收入减总支出", reason: jp ? "規模拡大と費用先行投資の結果" : "反映规模增长与先行投入的结果" },
    { row: 46, label: t.margin, unit: "%", er: engineRows.margin, mode: "margin", desc: jp ? "営業利益÷売上高合計" : "营业利润÷总收入", reason: jp ? "収益性の主要指標" : "核心盈利能力指标" },
    { row: 47, label: t.endingCash, unit: "JPY m", er: engineRows.endingCash, mode: "endMoney", desc: jp ? "期首現金＋資金調達＋累計営業利益" : "期初现金+融资+累计营业利润", reason: jp ? "税・運転資本・設備投資は未反映" : "未计税费、营运资金及资本开支" },
  ];
  sectionBand(sheet, "A14:P14", t.revenue);
  sectionBand(sheet, "A26:P26", t.costs);
  for (const item of rows) sheet.getRange(`A${item.row}:B${item.row}`).values = [[item.label, item.unit]];
  for (const item of rows) sheet.getRange(`O${item.row}:P${item.row}`).values = [[item.desc, item.reason]];
  for (const scenario of ["A", "B"]) {
    const engine = scenario === "A" ? sheets.engineA : sheets.engineB;
    const outputBase = scenario === "A" ? 2 : 5;
    for (let year = 1; year <= 3; year++) {
      const outCol = colName(outputBase + year - 1);
      const pctCol = colName(outputBase + year - 1 + 6);
      const range = yearRange(year);
      for (const item of rows) {
        let formula;
        if (item.mode === "sumMoney") formula = `=SUM('${engine}'!${range.start}${item.er}:${range.end}${item.er})/1000000`;
        if (item.mode === "sumCount" || item.mode === "sumFlag") formula = `=SUM('${engine}'!${range.start}${item.er}:${range.end}${item.er})`;
        if (item.mode === "avg") formula = `=AVERAGE('${engine}'!${range.start}${item.er}:${range.end}${item.er})`;
        if (item.mode === "end") formula = `='${engine}'!${range.end}${item.er}`;
        if (item.mode === "endMoney") formula = `='${engine}'!${range.end}${item.er}/1000000`;
        if (item.mode === "margin") formula = `=IF(${outCol}24=0,0,${outCol}45/${outCol}24)`;
        sheet.getRange(`${outCol}${item.row}`).formulas = [[formula]];
        if (item.category === "revenue") sheet.getRange(`${pctCol}${item.row}`).formulas = [[`=IF(${outCol}$24=0,0,${outCol}${item.row}/${outCol}$24)`]];
        if (item.category === "expense") sheet.getRange(`${pctCol}${item.row}`).formulas = [[`=IF(${outCol}$42=0,0,${outCol}${item.row}/${outCol}$42)`]];
      }
    }
  }
  for (const address of ["A5:P12", "A15:P24", "A27:P42", "A44:P47"]) bodyBorders(sheet.getRange(address));
  sheet.getRange("C5:N47").format.font = { color: colors.linkGreen };
  sheet.getRange("C5:H12").format.numberFormat = fmt.one;
  sheet.getRange("C15:H45").format.numberFormat = fmt.moneyM;
  sheet.getRange("C46:H46").format.numberFormat = fmt.pct;
  sheet.getRange("C47:H47").format.numberFormat = fmt.moneyM;
  sheet.getRange("I5:N47").format.numberFormat = fmt.pct;
  sheet.getRange("O5:P47").format.wrapText = true;
  for (const row of [24, 42, 44, 45, 47]) styleTotal(sheet, `A${row}:P${row}`);
  sheet.getRange("A:A").format.columnWidth = 38;
  sheet.getRange("B:B").format.columnWidth = 15;
  sheet.getRange("C:H").format.columnWidth = 15;
  sheet.getRange("I:N").format.columnWidth = 12;
  sheet.getRange("O:P").format.columnWidth = 42;
  sheet.getRange("A1:P47").format.font = { name: "Arial", size: 9 };
  sheet.getRange("A1:A1").format.font = { name: "Arial", size: 18, bold: true, color: colors.white };
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(2);
  sheet.showGridLines = false;
}

function monthlyRowMap() {
  return [
    [5, engineRows.newStores], [6, engineRows.activeStores], [7, engineRows.activeTechs], [8, engineRows.totalMau], [9, engineRows.totalOrders], [10, engineRows.ekycEnabled], [11, engineRows.unmetForeignOrders], [12, engineRows.rndHeadcount],
    [15, engineRows.bookingRevenue], [16, engineRows.storeRevenue], [17, engineRows.s2bRevenue], [18, engineRows.memberRevenue], [19, engineRows.douRevenue], [20, engineRows.rankingRevenue], [21, engineRows.creatorRevenue], [22, engineRows.displayRevenue], [23, engineRows.hotelRevenue], [24, engineRows.totalRevenue],
    [27, engineRows.rndCost], [28, engineRows.rndHeadcount], [29, engineRows.rndPersonnelCost], [30, engineRows.serverTotal], [31, engineRows.payrollCost], [32, engineRows.marketingCost], [33, engineRows.bizdevCost], [34, engineRows.supportCost], [35, engineRows.adminCost], [36, engineRows.successFeeCost], [37, engineRows.adEventAcquisitionCost], [38, engineRows.ekycCost], [39, engineRows.riskCost], [40, engineRows.paymentCost], [41, engineRows.userRebateCost], [42, engineRows.hotelCost], [43, engineRows.totalCosts],
    [45, engineRows.preEkycProfit], [46, engineRows.operatingProfit], [47, engineRows.margin], [48, engineRows.endingCash],
  ];
}

function buildY1(sheet, config) {
  const { t, sheets } = config;
  titleBand(sheet, "A1:O1", t.y1Title);
  noteBand(sheet, "A2:O2", config.key === "jp" ? "各月は36か月モデルへのリンク。Y1合計はフロー項目を合計し、期末項目はM12を表示。" : "各月链接36个月模型；流量项目按月合计，期末项目显示M12。" );
  const blockStarts = [4, 52];
  const scenarios = [
    { code: "A", name: t.scenarioA, engine: sheets.engineA },
    { code: "B", name: t.scenarioB, engine: sheets.engineB },
  ];
  const labels = [
    [t.newStores, "store"], [t.activeStores, "store"], [t.activeTechs, "person"], [t.totalMau, "MAU"], [t.totalOrders, "order"], [t.ekycEnabled, "0/1"], [t.unmetForeignOrders, "order"], [t.rndHeadcount, "person"],
    [t.bookingRevenue, "JPY m"], [t.storeRevenue, "JPY m"], [t.s2bRevenue, "JPY m"], [t.memberRevenue, "JPY m"], [t.douRevenue, "JPY m"], [t.rankingRevenue, "JPY m"], [t.creatorRevenue, "JPY m"], [t.displayRevenue, "JPY m"], [t.hotelRevenue, "JPY m"], [t.totalRevenue, "JPY m"],
    [t.rndCost, "JPY m"], [t.rndHeadcount, "person"], [t.rndPersonnelCost, "JPY m"], [t.serverTotal, "JPY m"], [t.payrollCost, "JPY m"], [t.marketingCost, "JPY m"], [t.bizdevCost, "JPY m"], [t.supportCost, "JPY m"], [t.adminCost, "JPY m"], [t.successFeeCost, "JPY m"], [t.adEventAcquisitionCost, "JPY m"], [t.ekycCost, "JPY m"], [t.riskCost, "JPY m"], [t.paymentCost, "JPY m"], [t.userRebateCost, "JPY m"], [t.hotelCost, "JPY m"], [t.totalCosts, "JPY m"],
    [t.preEkycProfit, "JPY m"], [t.operatingProfit, "JPY m"], [t.margin, "%"], [t.endingCash, "JPY m"],
  ];
  const rowMap = monthlyRowMap();
  for (let b = 0; b < 2; b++) {
    const start = blockStarts[b];
    const { name, engine } = scenarios[b];
    sectionBand(sheet, `A${start}:O${start}`, name);
    sheet.getRange(`A${start + 1}:O${start + 1}`).values = [[t.parameter, t.unit, ...Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`), t.y1]];
    headerStyle(sheet.getRange(`A${start + 1}:O${start + 1}`));
    sectionBand(sheet, `A${start + 11}:O${start + 11}`, t.revenue);
    sectionBand(sheet, `A${start + 23}:O${start + 23}`, t.costs);
    const offsetRows = rowMap.map(([r]) => r - 3 + start);
    for (let i = 0; i < labels.length; i++) {
      const outputRow = offsetRows[i];
      sheet.getRange(`A${outputRow}:B${outputRow}`).values = [[labels[i][0], labels[i][1]]];
      const engineRow = rowMap[i][1];
      const formulas = [];
      for (let m = 0; m < 12; m++) {
        const engineCol = colName(2 + m);
        const scale = labels[i][1] === "JPY m" ? "/1000000" : "";
        formulas.push(`='${engine}'!${engineCol}${engineRow}${scale}`);
      }
      sheet.getRange(`C${outputRow}:N${outputRow}`).formulas = [[...formulas]];
      let totalFormula;
      const endMetrics = new Set([engineRows.activeStores, engineRows.activeTechs, engineRows.totalMau, engineRows.ekycEnabled, engineRows.rndHeadcount, engineRows.margin, engineRows.endingCash]);
      if (engineRow === engineRows.margin) totalFormula = `=IF(O${offsetRows[17]}=0,0,O${offsetRows[36]}/O${offsetRows[17]})`;
      else if (endMetrics.has(engineRow)) totalFormula = `=N${outputRow}`;
      else totalFormula = `=SUM(C${outputRow}:N${outputRow})`;
      sheet.getRange(`O${outputRow}`).formulas = [[totalFormula]];
    }
    for (const address of [`A${start + 2}:O${start + 9}`, `A${start + 12}:O${start + 21}`, `A${start + 24}:O${start + 40}`, `A${start + 42}:O${start + 45}`]) bodyBorders(sheet.getRange(address));
    sheet.getRange(`C${start + 2}:O${start + 45}`).format.font = { color: colors.linkGreen };
    sheet.getRange(`C${offsetRows[0]}:O${offsetRows[7]}`).format.numberFormat = fmt.one;
    for (const idx of [...Array.from({ length: 10 }, (_, j) => 8 + j), 18, ...Array.from({ length: 15 }, (_, j) => 20 + j), 35, 36, 38]) sheet.getRange(`C${offsetRows[idx]}:O${offsetRows[idx]}`).format.numberFormat = fmt.moneyM;
    sheet.getRange(`C${offsetRows[19]}:O${offsetRows[19]}`).format.numberFormat = fmt.one;
    sheet.getRange(`C${offsetRows[37]}:O${offsetRows[37]}`).format.numberFormat = fmt.pct;
    for (const idx of [17, 34, 35, 36, 38]) styleTotal(sheet, `A${offsetRows[idx]}:O${offsetRows[idx]}`);
  }
  sheet.getRange("A:A").format.columnWidth = 38;
  sheet.getRange("B:B").format.columnWidth = 13;
  sheet.getRange("C:O").format.columnWidth = 12;
  sheet.getRange("A1:O100").format.font = { name: "Arial", size: 9 };
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
      const annualValueCol = colName((scenario === "A" ? 2 : 5) + year - 1);
      const annualPctCol = colName((scenario === "A" ? 2 : 5) + year - 1 + 6);
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
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "年間注文数単位" : "年度订单数单位"}`,
        actual: `='${sheets.annual}'!${annualValueCol}9`,
        expected: `=SUM('${engine}'!${range.start}${engineRows.totalOrders}:${range.end}${engineRows.totalOrders})`,
        tolerance: 0.01,
        fix: `${sheets.annual}!${annualValueCol}9`,
      });
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "R&D期末人員" : "研发期末人数"}`,
        actual: `='${engine}'!${range.end}${engineRows.rndHeadcount}`,
        expected: `=${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rndEndHeadcount)}`,
        tolerance: 0.01,
        fix: `${engine}!${range.end}${engineRows.rndHeadcount}`,
      });
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "R&D人件費" : "研发人员成本"}`,
        actual: `=SUM('${engine}'!${range.start}${engineRows.rndPersonnelCost}:${range.end}${engineRows.rndPersonnelCost})`,
        expected: `=SUM('${engine}'!${range.start}${engineRows.rndHeadcount}:${range.end}${engineRows.rndHeadcount})*${assumptionRef(sheets.assumptions, scenario, year, assumptionRows.rndCostPerPerson)}`,
        tolerance: 1,
        fix: `${engine}!${range.start}${engineRows.rndHeadcount}:${range.end}${engineRows.rndPersonnelCost}`,
      });
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "売上構成比合計" : "收入占比合计"}`,
        actual: `=SUM('${sheets.annual}'!${annualPctCol}15:${annualPctCol}23)`,
        expected: "=1",
        tolerance: 0.0001,
        fix: `${sheets.annual}!${annualPctCol}15:${annualPctCol}24`,
      });
      checks.push({
        name: `${scenario} ${t.y1.replace("1", String(year))} ${config.key === "jp" ? "費用構成比合計" : "支出占比合计"}`,
        actual: `=SUM('${sheets.annual}'!${annualPctCol}27:${annualPctCol}41)`,
        expected: "=1",
        tolerance: 0.0001,
        fix: `${sheets.annual}!${annualPctCol}27:${annualPctCol}42`,
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
      name: `${scenario} ${config.key === "jp" ? "M01〜M06紹介・営業100%" : "M01至M06介绍/营业100%"}`,
      actual: `=SUM('${engine}'!C${engineRows.organicShare}:H${engineRows.adEventShare})`,
      expected: "=0",
      tolerance: 0.0001,
      fix: `${engine}!C${engineRows.salesReferralShare}:H${engineRows.adEventShare}`,
    });
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "M12チャネル比率" : "M12渠道占比"}`,
      actual: `=ABS('${engine}'!N${engineRows.salesReferralShare}-${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.salesReferralShare)})+ABS('${engine}'!N${engineRows.organicShare}-${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.organicShare)})+ABS('${engine}'!N${engineRows.adEventShare}-${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.adEventShare)})`,
      expected: "=0",
      tolerance: 0.0001,
      fix: `${engine}!N${engineRows.salesReferralShare}:N${engineRows.adEventShare}`,
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
      name: `${scenario} ${config.key === "jp" ? "M01 R&D人員" : "M01研发人数"}`,
      actual: `='${engine}'!C${engineRows.rndHeadcount}`,
      expected: `=${assumptionRef(sheets.assumptions, scenario, 1, assumptionRows.rndStartHeadcount)}`,
      tolerance: 0.01,
      fix: `${engine}!C${engineRows.rndHeadcount}`,
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
    checks.push({
      name: `${scenario} ${config.key === "jp" ? "ホテル共同予約除外" : "酒店联合预约暂不计入"}`,
      actual: `=SUM('${engine}'!C${engineRows.hotelRevenue}:AL${engineRows.hotelRevenue})+SUM('${engine}'!C${engineRows.hotelCost}:AL${engineRows.hotelCost})`,
      expected: "=0",
      tolerance: 1,
      fix: `${sheets.assumptions}!${scenarioCell(scenario, 1, assumptionRows.hotelOrderShare)}:${scenarioCell(scenario, 3, assumptionRows.hotelOrderShare)}`,
    });
  }
  for (const [row, jpName, cnName] of [
    [assumptionRows.storePatternY1, "Y1月次獲得配分合計", "Y1月度签约分配合计"],
    [assumptionRows.storePatternY2, "Y2月次獲得配分合計", "Y2月度签约分配合计"],
    [assumptionRows.storePatternY3, "Y3月次獲得配分合計", "Y3月度签约分配合计"],
    [assumptionRows.foreignLaunchPattern, "Y1外国人配分合計", "Y1外国用户分配合计"],
    [assumptionRows.foreignSteadyPattern, "Y2/Y3外国人配分合計", "Y2/Y3外国用户分配合计"],
  ]) {
    checks.push({
      name: config.key === "jp" ? jpName : cnName,
      actual: `=SUM('${sheets.assumptions}'!C${row}:N${row})`,
      expected: "=1",
      tolerance: 0.0001,
      fix: `${sheets.assumptions}!C${row}:N${row}`,
    });
  }
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
    ["店舗獲得チャネル", "M01〜M06は紹介・営業100%。M07から自然流入・広告イベントを段階導入", "ユーザー指定", "2026-08-22", "A/B共通。紹介比率はY1末40%→Y2末15%→Y3末5%"],
    ["eKYC", "最初の6か月は0。前月のeKYC前営業利益がプラスになった翌月から開始", "ユーザー指定", "2026-08-21", "循環参照を避けるためeKYC前利益で判定"],
    ["初期開発費", "2,000万円をM01に一括計上。M02以降0", "ユーザー指定", "2026-08-22", "運用人員は別途人件費に計上"],
    ["継続R&D", "Aは1→3→6→10名、Bは1→5→10→15名。70万円/人月", "https://shigoto.mhlw.go.jp/User/Occupation/Detail/314", "2026-08-22", "給与・会社負担・採用・機器・開発ツールを含む管理フルコスト"],
    ["サーバー費用", "固定25万円/月＋15円/完了取引＋10円/稼働アカウント/月", "https://aws.amazon.com/jp/fargate/pricing/ ; https://aws.amazon.com/jp/rds/pricing/ ; https://aws.amazon.com/jp/cloudwatch/pricing/", "2026-08-22", "AWSの最低料金なし・従量課金を参考にした管理仮定"],
    ["表示単位", "注文数・eKYC件数・未充足需要は実数。金額のみ百万円", "ユーザー指摘を受けた表示修正", "2026-08-22", "旧版の0.1等は件数を誤って100万で除算した表示"],
    ["ホテル共同予約", "契約条件未確定のため注文比率0%", "管理判断", "2026-08-22", "売上と支出を同額計上する総額膨張を除外"],
    ["風俗関連市場上限", "R7無店舗型22,792件、うち派遣型等21,353件。総量は近年ほぼ横ばい", "https://www.npa.go.jp/news/release/2026/080423huzokukankeitoukei.pdf", "2026-08-22", "Bの6,000店は混合カテゴリーとPMF成立を条件とする上振れケース"],
    ["上門型成長ベンチマーク", "HOGUGU掲載セラピスト3,500名超(2025-02)→4,000名超(2025-07)→5,000名(2026-01)", "https://prtimes.jp/main/html/rd/p/000000024.000047992.html ; https://prtimes.jp/main/html/rd/p/000000028.000047992.html ; https://prtimes.jp/main/html/rd/p/000000035.000047992.html", "2026-08-22", "ネットワーク形成後の供給側加速を参考"],
    ["予約プラットフォーム", "HOT PEPPER Beauty予約数約290万(FY2011)→約1.6億(FY2024)、FY2019-24 GMV CAGR14.2%", "https://recruit-holdings.com/en/ir/library/upload/recruit_202603Q3_call-transcript_en/", "2026-08-22", "全国営業→店舗増→利用者増の好循環と広告施策を参考"],
    ["施術者直接予約", "minimoは登録サロンスタッフ7万人、月間利用者100万人、年間予約700万件の公表値", "https://minimodel.jp/info?from=footer", "2026-08-22", "個人・口コミ・自然流入型の供給獲得を参考"],
  ] : [
    ["店铺固定月费", "全部活跃店铺×每月9,800日元，自合同开始月按月确认", "用户要求", "2026-08-21", "与Booking免费期分开"],
    ["最低合同期限", "6个月内店铺流失为0，不按6个月预收", "用户要求", "2026-08-21", "流失率从第7个月起适用"],
    ["店铺成功报酬", "介绍及营业渠道新店×30,000日元×适用比例", "用户要求", "2026-08-21", "自然流入及广告活动渠道不计成功报酬"],
    ["店铺获客渠道", "M01至M06介绍/营业100%；M07起逐步加入自然流入及广告活动", "用户要求", "2026-08-22", "A/B相同；介绍占比Y1末40%→Y2末15%→Y3末5%"],
    ["eKYC", "前6个月为0；上月eKYC前营业利润为正时，于次月启用", "用户要求", "2026-08-21", "使用eKYC前利润判断，避免循环引用"],
    ["初期开发费", "2,000万日元仅在M01一次性计入，M02以后为0", "用户要求", "2026-08-22", "后续运维人员计入人力成本"],
    ["持续研发", "A按1→3→6→10人，B按1→5→10→15人；70万日元/人月", "https://shigoto.mhlw.go.jp/User/Occupation/Detail/314", "2026-08-22", "包含工资、公司负担、招聘、设备及开发工具的管理全口径成本"],
    ["服务器费用", "固定25万日元/月＋15日元/完单＋10日元/活跃账户/月", "https://aws.amazon.com/jp/fargate/pricing/ ; https://aws.amazon.com/jp/rds/pricing/ ; https://aws.amazon.com/jp/cloudwatch/pricing/", "2026-08-22", "参考AWS无最低费用及按量计费模式的管理假设"],
    ["显示单位", "订单数、eKYC数量及未满足需求均显示实际数量；仅金额使用百万日元", "根据用户反馈修正", "2026-08-22", "旧版0.1等为错误除以100万后的显示"],
    ["酒店联合预约", "合同条件尚未确定，订单比例设为0%", "管理判断", "2026-08-22", "排除收入与支出同额导致的规模虚增"],
    ["风俗相关市场上限", "R7无店铺型22,792家，其中派遣型等21,353家；近年总量基本平稳", "https://www.npa.go.jp/news/release/2026/080423huzokukankeitoukei.pdf", "2026-08-22", "B方案6,000家属于覆盖混合品类且形成PMF后的上行情景"],
    ["上门型增长基准", "HOGUGU上线技师3,500名以上(2025-02)→4,000名以上(2025-07)→5,000名(2026-01)", "https://prtimes.jp/main/html/rd/p/000000024.000047992.html ; https://prtimes.jp/main/html/rd/p/000000028.000047992.html ; https://prtimes.jp/main/html/rd/p/000000035.000047992.html", "2026-08-22", "用于校准平台形成网络后供给侧加速"],
    ["预约平台增长", "HOT PEPPER Beauty预约数约290万(FY2011)→约1.6亿(FY2024)，FY2019-24 GMV CAGR 14.2%", "https://recruit-holdings.com/en/ir/library/upload/recruit_202603Q3_call-transcript_en/", "2026-08-22", "参考全国营业、店铺增加、用户增加的正循环及营销活动"],
    ["技师直接预约", "minimo公开注册沙龙技师7万人、月度用户100万人、年度预约700万件", "https://minimodel.jp/info?from=footer", "2026-08-22", "用于校准个人、口碑及自然流入渠道"],
  ];
  const sourceEnd = 4 + rows.length;
  sheet.getRange(`A5:E${sourceEnd}`).values = rows;
  bodyBorders(sheet.getRange(`A5:E${sourceEnd}`));
  const versionBandRow = sourceEnd + 3;
  const versionHeaderRow = versionBandRow + 1;
  const historyStart = versionHeaderRow + 1;
  sectionBand(sheet, `A${versionBandRow}:E${versionBandRow}`, t.versionHistory);
  sheet.getRange(`A${versionHeaderRow}:E${versionHeaderRow}`).values = [["Version", config.key === "jp" ? "更新日" : "更新日期", config.key === "jp" ? "主な変更" : "主要变更", config.key === "jp" ? "作成者" : "制作", t.note]];
  headerStyle(sheet.getRange(`A${versionHeaderRow}:E${versionHeaderRow}`));
  const history = config.key === "jp" ? [
    ["V1.5", "2026-08-19", "月額9,800円、最低契約6か月、初期30,000円総額", "Codex", "旧モデル"],
    ["V2.0", "2026-08-21", "36か月モデル、Y1月次、30,000円/新規店、サーバー変動費、eKYC利益ゲート", "Codex", "旧モデル"],
    ["V2.1", "2026-08-22", "開発費M01一括、サーバー従量化、店舗獲得3チャネル、B成長曲線再校準", "Codex", "旧モデル"],
    ["V2.2", "2026-08-22", "件数単位・eKYC表示修正、6か月100%紹介、継続R&D人員、P&L構成比・理由追加", "Codex", "本版"],
  ] : [
    ["V1.5", "2026-08-19", "月费9,800日元、最低合同6个月、初期30,000日元总额", "Codex", "旧模型"],
    ["V2.0", "2026-08-21", "36个月模型、第一年月度、每新店30,000日元、服务器变动费用、eKYC利润门槛", "Codex", "旧模型"],
    ["V2.1", "2026-08-22", "开发费M01一次性计入、服务器按量、店铺获客三渠道、重新校准B增长曲线", "Codex", "旧模型"],
    ["V2.2", "2026-08-22", "修正数量单位及eKYC显示、前6个月100%介绍、持续研发人力、增加P&L占比及理由", "Codex", "本版本"],
  ];
  const historyEnd = historyStart + history.length - 1;
  sheet.getRange(`A${historyStart}:E${historyEnd}`).values = history;
  bodyBorders(sheet.getRange(`A${historyStart}:E${historyEnd}`));
  sheet.getRange("A:E").format.wrapText = true;
  sheet.getRange("A:A").format.columnWidth = 28;
  sheet.getRange("B:B").format.columnWidth = 52;
  sheet.getRange("C:C").format.columnWidth = 62;
  sheet.getRange("D:D").format.columnWidth = 16;
  sheet.getRange("E:E").format.columnWidth = 38;
  sheet.getRange(`A1:E${historyEnd}`).format.font = { name: "Arial", size: 10 };
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
    [t.totalRevenue, 24, fmt.moneyM],
    [t.operatingProfit, 45, fmt.moneyM],
    [t.margin, 46, fmt.pct],
    [t.endingCash, 47, fmt.moneyM],
    [t.activeStores, 5, fmt.one],
    [config.key === "jp" ? "eKYC稼働月数／年" : "eKYC启用月数/年", 10, fmt.one],
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
    [config.key === "jp" ? "M01 R&D人員" : "M01研发人数", engineRows.rndHeadcount, "pointRawM1", "person", config.key === "jp" ? "初期は1名" : "初期1人"],
    [config.key === "jp" ? "M12 R&D人員" : "M12研发人数", engineRows.rndHeadcount, "pointRawM12", "person", config.key === "jp" ? "Aは3名、Bは5名へ増員" : "A增至3人，B增至5人"],
    [config.key === "jp" ? "M01サーバー費用" : "M01服务器费用", engineRows.serverTotal, "pointM1", "JPY m", config.key === "jp" ? "固定25万円＋利用量" : "固定25万日元＋实际用量"],
    [config.key === "jp" ? "M12サーバー費用" : "M12服务器费用", engineRows.serverTotal, "pointM12", "JPY m", config.key === "jp" ? "注文・アカウント増加を反映" : "反映订单及活跃账户增长"],
    [config.key === "jp" ? "初回eKYC通算月" : "首次eKYC累计月", engineRows.ekycEnabled, "match", "model month", config.key === "jp" ? "0=3年間未開始、M01=1" : "0=三年内未启用，M01=1"],
  ];
  sheet.getRange("A15:A24").values = decisionRows.map((x) => [x[0]]);
  sheet.getRange("D15:D24").values = decisionRows.map((x) => [x[4]]);
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
      if (mode === "pointRawM1") formula = `='${engine}'!C${engineRow}`;
      if (mode === "pointRawM12") formula = `='${engine}'!N${engineRow}`;
      sheet.getRange(`${outCol}${15 + i}`).formulas = [[formula]];
    }
  }
  bodyBorders(sheet.getRange("A15:D24"));
  sheet.getRange("B15:C24").format.font = { color: colors.linkGreen };
  sheet.getRange("B15:C18").format.numberFormat = fmt.one;
  sheet.getRange("B19:C19").format.numberFormat = fmt.moneyM;
  sheet.getRange("B20:C21").format.numberFormat = fmt.one;
  sheet.getRange("B22:C23").format.numberFormat = fmt.moneyM;
  sheet.getRange("B24:C24").format.numberFormat = fmt.one;

  sheet.getRange("I4:N4").merge();
  sheet.getRange("I4").values = [[t.status]];
  sheet.getRange("I4:N4").format = { fill: colors.darkNavy, font: { color: colors.white, bold: true }, horizontalAlignment: "center" };
  sheet.getRange("I5:N8").merge();
  sheet.getRange("I5").formulas = [[`='${sheets.checks}'!B2`]];
  sheet.getRange("I5:N8").format = { fill: colors.lightGreen, font: { color: "#006100", bold: true, size: 24 }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "medium", color: colors.navy } };

  sheet.getRange("A27:E39").values = [[t.month, `${t.scenarioA} ${t.totalRevenue}`, `${t.scenarioA} ${t.operatingProfit}`, `${t.scenarioB} ${t.totalRevenue}`, `${t.scenarioB} ${t.operatingProfit}`], ...Array.from({ length: 12 }, (_, i) => [`M${String(i + 1).padStart(2, "0")}`, null, null, null, null])];
  headerStyle(sheet.getRange("A27:E27"));
  for (let i = 0; i < 12; i++) {
    const engineCol = colName(2 + i);
    sheet.getRange(`B${28 + i}:E${28 + i}`).formulas = [[
      `='${sheets.engineA}'!${engineCol}${engineRows.totalRevenue}/1000000`,
      `='${sheets.engineA}'!${engineCol}${engineRows.operatingProfit}/1000000`,
      `='${sheets.engineB}'!${engineCol}${engineRows.totalRevenue}/1000000`,
      `='${sheets.engineB}'!${engineCol}${engineRows.operatingProfit}/1000000`,
    ]];
  }
  sheet.getRange("B28:E39").format.numberFormat = fmt.moneyM;
  sheet.getRange("B28:E39").format.font = { color: colors.linkGreen };
  bodyBorders(sheet.getRange("A28:E39"));

  sheet.getRange("A43:C55").values = [[t.month, `${t.scenarioA} ${t.activeStores}`, `${t.scenarioB} ${t.activeStores}`], ...Array.from({ length: 12 }, (_, i) => [`M${String(i + 1).padStart(2, "0")}`, null, null])];
  headerStyle(sheet.getRange("A43:C43"));
  for (let i = 0; i < 12; i++) {
    const engineCol = colName(2 + i);
    sheet.getRange(`B${44 + i}:C${44 + i}`).formulas = [[`='${sheets.engineA}'!${engineCol}${engineRows.activeStores}`, `='${sheets.engineB}'!${engineCol}${engineRows.activeStores}`]];
  }
  sheet.getRange("B44:C55").format.numberFormat = fmt.one;
  sheet.getRange("B44:C55").format.font = { color: colors.linkGreen };
  bodyBorders(sheet.getRange("A44:C55"));

  const chart1 = sheet.charts.add("line", sheet.getRange("A27:E39"));
  chart1.title = config.key === "jp" ? "Y1月次 売上高・営業利益（百万円）" : "第一年月度收入与营业利润（百万日元）";
  chart1.hasLegend = true;
  chart1.xAxis = { axisType: "textAxis" };
  chart1.yAxis = { numberFormatCode: "0.0" };
  chart1.setPosition("F27", "N41");

  const chart2 = sheet.charts.add("line", sheet.getRange("A43:C55"));
  chart2.title = config.key === "jp" ? "Y1月次 稼働店舗数" : "第一年月度活跃店铺数";
  chart2.hasLegend = true;
  chart2.xAxis = { axisType: "textAxis" };
  chart2.yAxis = { numberFormatCode: "#,##0" };
  chart2.setPosition("F43", "N57");

  sheet.getRange("A:A").format.columnWidth = 32;
  sheet.getRange("B:G").format.columnWidth = 15;
  sheet.getRange("H:H").format.columnWidth = 4;
  sheet.getRange("I:N").format.columnWidth = 15;
  sheet.getRange("A1:N57").format.font = { name: "Arial", size: 10 };
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
    summary: `${config.key} V2.2 formula error scan`,
    maxChars: 12000,
  });
  const checksInspect = await workbook.inspect({
    kind: "table",
    sheetId: config.sheets.checks,
    range: "A1:G100",
    include: "values,formulas",
    tableMaxRows: 100,
    tableMaxCols: 7,
    maxChars: 18000,
  });
  const engineInspect = await workbook.inspect({
    kind: "table",
    sheetId: config.sheets.engineA,
    range: "A9:N80",
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

await fs.writeFile(path.join(workDir, "build_results_v22.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  outputs: Object.values(results).map((x) => x.outputPath),
  hardErrors: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.hardErrors])),
}, null, 2));
