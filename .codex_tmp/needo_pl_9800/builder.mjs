import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sources = [
  {
    key: "jp",
    path: "/Users/eason/Documents/NeeDo/NeeDo_3カ年財務モデル_JP_2026-08-14_日本語版.xlsx",
  },
  {
    key: "cn",
    path: "/Users/eason/Documents/NeeDo/NeeDo_三年财务模型_CN_2026-08-14.xlsx",
  },
];

const workDir = "/Users/eason/Documents/New project/.codex_tmp/needo_pl_9800";
const outputDir = "/Users/eason/Documents/New project/outputs/01a01893-cba2-7063-ab00-e9f8e301040a";
const previewDir = path.join(workDir, "previews_after");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const configs = {
  jp: {
    outputName: "NeeDo_3カ年財務モデル_JP_V1.5_2026-08-19_日本語版.xlsx",
    sheets: {
      dashboard: "ダッシュボード",
      scenarioA: "シナリオA（保守）",
      scenarioB: "シナリオB（高成長）",
      assumptions: "前提条件",
      ramp: "月次店舗ランプ",
      expenseDefinitions: "費用定義",
      pnl: "損益計算書",
      revenueEvolution: "売上推移",
      revenueMix: "売上構成",
      references: "前提・参考資料",
    },
    text: {
      dashboardTitle: "NeeDo 3カ年財務モデル V1.5（店舗固定月額・最低契約期間・初期紹介者広告費｜日本語版）",
      dashboardUpdate: "更新：2026-08-19｜全店舗に月額9,800円（最低契約期間6か月）｜初回営業月に紹介者広告費30,000円を1回計上｜その他の前提はV1.4を継承",
      assumptionsTitle: "NeeDo 3カ年財務モデル V1.5｜前提条件（入力専用シート）",
      fixedFeeLabel: "店舗固定月額料金／店舗",
      fixedFeeNote: "契約開始月から全シナリオで月額9,800円を課金。最低契約期間6か月。売上は月次で認識",
      contractLabel: "店舗最低契約期間（月）",
      contractNote: "6か月未満の解約は想定しない。店舗数ランプは継続稼働店舗数として使用",
      initialAdLabel: "初期紹介者広告費（1回限り）",
      initialAdNote: "初回営業月に紹介者へ支払う広告費。両シナリオともY1のみ1回計上",
      freePeriodNote: "新規店舗は最初の3か月間、Bookingプラットフォーム手数料が0。店舗固定月額料金は契約開始月から課金",
      rampNote: "本シートは店舗数と国内取引の基礎ドライバーです。訪日外国人の増分は「訪日外国人試算」を参照してください。新規店舗のBookingプラットフォーム手数料は最初の3か月間無料ですが、店舗固定月額料金9,800円は契約開始月から課金し、最低契約期間は6か月です。",
      scenarioNote: "店舗数は月次でランプアップします。店舗固定月額9,800円は契約開始月から月次認識し、最低契約期間は6か月です。訪日外国人男性ユーザーと利用回数も追加計上します。金額単位：百万円。",
      chargeableMonthsLabel: "Booking課金対象店舗月数",
      chargeableMonthsNote: "3か月のBooking無料期間を終了した店舗月数の合計",
      freeMonthsLabel: "新規店舗1店舗当たりBooking無料月数",
      freeMonthsNote: "現在は3か月。店舗固定月額料金には適用しない",
      fixedRevenueLabel: "店舗固定月額収入",
      fixedRevenueNote: "年間平均稼働店舗数×12×月額9,800円（最低契約期間6か月）",
      adExpenseLabel: "広告・ブランドプロモーション（初期紹介者広告費含む）",
      adExpenseNote: "通常の広告予算＋初回営業月に紹介者へ支払う30,000円（Y1のみ）",
      fixedRevenueShort: "店舗固定月額収入",
      fixedRevenueMixNote: "店舗向け月額9,800円。最低契約期間6か月",
      referenceUpdate: "更新日：2026-08-19。全店舗の固定月額9,800円、最低契約期間6か月、初期紹介者広告費30,000円を反映。その他の外部基準値・シナリオ前提はV1.4を継承します。",
      referenceFreeTopic: "Booking無料期間と店舗固定月額",
      referenceFreeTreatment: "Booking手数料は新規店舗の最初の3か月が0。店舗固定月額9,800円は契約開始月から課金",
      referenceFreeReason: "最低契約期間は6か月。固定月額は月次認識し、Booking無料期間とは分離",
      referenceFeeTopic: "店舗固定月額収入",
      referenceFeeTreatment: "全シナリオで月額9,800円／店舗。最低契約期間6か月",
      referenceFeeReason: "年間平均稼働店舗数×12か月で算出し、契約開始月から月次で売上認識",
      referenceAdTopic: "初期紹介者広告費",
      referenceAdTreatment: "初回営業月に紹介者へ30,000円を1回支払う",
      referenceAdReason: "両シナリオY1のみ広告・ブランドプロモーション費に計上。継続レベニューシェアとは別",
      expenseDefinitionRow: ["初期紹介者広告費", "広告・ブランドプロモーション", "Y1のみ1回計上し、継続レベニューシェアと区分", "初回営業月に30,000円", null, null, null, null],
      commentFee: "User instruction (2026-08-19): every active store pays JPY 9,800 per month.",
      commentContract: "User instruction (2026-08-19): minimum store contract term is six months; revenue remains recognized monthly.",
      commentAd: "User instruction (2026-08-19): one-time initial advertising fee of JPY 30,000 paid to the introducer.",
    },
  },
  cn: {
    outputName: "NeeDo_三年财务模型_CN_V1.5_2026-08-19.xlsx",
    sheets: {
      dashboard: "首页仪表盘",
      scenarioA: "方案A（保守）",
      scenarioB: "方案B（高速增长）",
      assumptions: "参数设置",
      ramp: "月度店铺爬坡",
      expenseDefinitions: "费用口径说明",
      pnl: "利润表汇总",
      revenueEvolution: "收入演进",
      revenueMix: "收入结构",
      references: "参考说明",
    },
    text: {
      dashboardTitle: "NeeDo 三年财务模型 V1.5（店铺固定月费、最低合同期及初期介绍人广告费｜中文版）",
      dashboardUpdate: "更新：2026-08-19｜所有店铺月费9,800日元（最低合同6个月）｜首个营业月一次性计入介绍人广告费30,000日元｜其余假设沿用V1.4",
      assumptionsTitle: "NeeDo 三年财务模型 V1.5｜参数设置（仅输入）",
      fixedFeeLabel: "店铺固定月费／店",
      fixedFeeNote: "所有方案从合同开始月起每店每月收取9,800日元；最低合同期6个月；收入按月确认",
      contractLabel: "店铺最低合同期限（月）",
      contractNote: "不假设6个月内提前解约；店铺爬坡数视为持续活跃店铺数",
      initialAdLabel: "初期介绍人广告费（一次性）",
      initialAdNote: "首个营业月向介绍人支付的广告费；两个方案均仅在Y1计入一次",
      freePeriodNote: "新店最初3个月仅免Booking平台费；店铺固定月费自合同开始月起收取",
      rampNote: "本表为店铺数及本地订单基础驱动；外国用户增量另见专项表。新店最初3个月免Booking平台费，但店铺固定月费9,800日元自合同开始月起收取，最低合同期6个月。",
      scenarioNote: "店铺按月爬坡。固定月费9,800日元自合同开始月起按月确认，最低合同期6个月；外国男性用户及消费次数额外计入。金额单位：百万日元。",
      chargeableMonthsLabel: "Booking收费店铺月数",
      chargeableMonthsNote: "已结束3个月Booking免费期的店铺月数合计",
      freeMonthsLabel: "每家新店Booking免费月数",
      freeMonthsNote: "当前为3个月；不适用于店铺固定月费",
      fixedRevenueLabel: "店铺固定月费收入",
      fixedRevenueNote: "年平均活跃店铺数×12×月费9,800日元（最低合同期6个月）",
      adExpenseLabel: "广告及品牌推广（含初期介绍人广告费）",
      adExpenseNote: "常规广告预算＋首个营业月向介绍人支付30,000日元（仅Y1）",
      fixedRevenueShort: "店铺固定月费收入",
      fixedRevenueMixNote: "每店月费9,800日元；最低合同期6个月",
      referenceUpdate: "更新日：2026-08-19。已反映每店月费9,800日元、最低合同期6个月及初期介绍人广告费30,000日元；其余外部基准和情景假设沿用V1.4。",
      referenceFreeTopic: "Booking免费期与店铺固定月费",
      referenceFreeTreatment: "Booking平台费在新店最初3个月为0；店铺固定月费9,800日元自合同开始月起收取",
      referenceFreeReason: "最低合同期6个月；固定月费按月确认，并与Booking免费期分开",
      referenceFeeTopic: "店铺固定月费收入",
      referenceFeeTreatment: "所有方案每店每月9,800日元；最低合同期6个月",
      referenceFeeReason: "按年平均活跃店铺数×12个月计算，自合同开始月起按月确认收入",
      referenceAdTopic: "初期介绍人广告费",
      referenceAdTreatment: "首个营业月向介绍人一次性支付30,000日元",
      referenceAdReason: "两个方案均仅在Y1计入广告及品牌推广费，与持续介绍人分润分开",
      expenseDefinitionRow: ["初期介绍人广告费", "广告及品牌推广", "仅Y1一次性计入，与持续介绍人分润分开", "首个营业月30,000日元", null, null, null, null],
      commentFee: "用户要求（2026-08-19）：每个活跃店铺每月支付9,800日元固定费用。",
      commentContract: "用户要求（2026-08-19）：店铺最低合同期限为6个月；收入仍按月确认。",
      commentAd: "用户要求（2026-08-19）：初期向介绍人一次性支付30,000日元广告费。",
    },
  },
};

function setText(sheet, cell, value) {
  sheet.getRange(cell).values = [[value]];
}

function updateScenario(sheet, assumptionSheetName, assumptionCols, text) {
  setText(sheet, "A2", text.scenarioNote);
  setText(sheet, "A7", text.chargeableMonthsLabel);
  setText(sheet, "E7", text.chargeableMonthsNote);
  setText(sheet, "A16", text.freeMonthsLabel);
  setText(sheet, "E16", text.freeMonthsNote);
  setText(sheet, "A20", text.fixedRevenueLabel);
  setText(sheet, "E20", text.fixedRevenueNote);
  setText(sheet, "A33", text.adExpenseLabel);
  setText(sheet, "E33", text.adExpenseNote);

  const yearCols = ["B", "C", "D"];
  sheet.getRange("B20:D20").formulas = [[
    ...yearCols.map((yearCol, index) =>
      `=${yearCol}6*12*'${assumptionSheetName}'!${assumptionCols[index]}15/1000000`,
    ),
  ]];
  sheet.getRange("B33:D33").formulas = [[
    ...assumptionCols.map(
      (assumptionCol) =>
        `=('${assumptionSheetName}'!${assumptionCol}49+'${assumptionSheetName}'!${assumptionCol}56)/1000000`,
    ),
  ]];
}

const verification = {};
for (const source of sources) {
  const config = configs[source.key];
  const { sheets, text } = config;
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source.path));

  const dashboard = workbook.worksheets.getItem(sheets.dashboard);
  const assumptions = workbook.worksheets.getItem(sheets.assumptions);
  const ramp = workbook.worksheets.getItem(sheets.ramp);
  const scenarioA = workbook.worksheets.getItem(sheets.scenarioA);
  const scenarioB = workbook.worksheets.getItem(sheets.scenarioB);
  const expenseDefinitions = workbook.worksheets.getItem(sheets.expenseDefinitions);
  const pnl = workbook.worksheets.getItem(sheets.pnl);
  const revenueEvolution = workbook.worksheets.getItem(sheets.revenueEvolution);
  const revenueMix = workbook.worksheets.getItem(sheets.revenueMix);
  const references = workbook.worksheets.getItem(sheets.references);

  setText(dashboard, "A1", text.dashboardTitle);
  setText(dashboard, "A2", text.dashboardUpdate);
  setText(assumptions, "A1", text.assumptionsTitle);

  assumptions.getRange("A18:H18").copyFrom(assumptions.getRange("A16:H16"), "all");
  assumptions.getRange("A18:H18").values = [[
    text.contractLabel,
    6,
    6,
    6,
    6,
    6,
    6,
    text.contractNote,
  ]];
  assumptions.getRange("B18:G18").format.fill = "#FFF2CC";
  assumptions.getRange("B18:G18").format.font = { color: "#0000FF" };
  assumptions.getRange("B18:G18").format.numberFormat = "#,##0";
  assumptions.getRange("A56:H56").copyFrom(assumptions.getRange("A49:H49"), "all");
  assumptions.getRange("A56:H56").values = [[
    text.initialAdLabel,
    30000,
    0,
    0,
    30000,
    0,
    0,
    text.initialAdNote,
  ]];
  assumptions.getRange("B56:G56").format.fill = "#FFF2CC";
  assumptions.getRange("B56:G56").format.font = { color: "#0000FF" };
  assumptions.getRange("B56:G56").format.numberFormat = "#,##0";
  assumptions.getRange("A15:H15").values = [[
    text.fixedFeeLabel,
    9800,
    9800,
    9800,
    9800,
    9800,
    9800,
    text.fixedFeeNote,
  ]];
  setText(assumptions, "H13", text.freePeriodNote);
  setText(ramp, "A2", text.rampNote);

  updateScenario(scenarioA, sheets.assumptions, ["B", "C", "D"], text);
  updateScenario(scenarioB, sheets.assumptions, ["E", "F", "G"], text);

  setText(pnl, "A5", text.fixedRevenueShort);
  setText(revenueEvolution, "A5", text.fixedRevenueShort);
  setText(revenueMix, "A5", text.fixedRevenueShort);
  setText(revenueMix, "H5", text.fixedRevenueMixNote);

  expenseDefinitions.getRange("A24:H24").copyFrom(expenseDefinitions.getRange("A23:H23"), "all");
  expenseDefinitions.getRange("A24:H24").values = [text.expenseDefinitionRow];

  setText(references, "A2", text.referenceUpdate);
  references.getRange("A7:C7").values = [[
    text.referenceFreeTopic,
    text.referenceFreeTreatment,
    text.referenceFreeReason,
  ]];
  references.getRange("A11:C11").values = [[
    text.referenceFeeTopic,
    text.referenceFeeTreatment,
    text.referenceFeeReason,
  ]];
  references.getRange("A16:F16").copyFrom(references.getRange("A15:F15"), "all");
  references.getRange("A16:F16").values = [[
    text.referenceAdTopic,
    text.referenceAdTreatment,
    text.referenceAdReason,
    null,
    null,
    null,
  ]];

  const keyChecks = [];
  for (const [sheetName, range] of [
    [sheets.assumptions, "A13:H18"],
    [sheets.assumptions, "A49:H56"],
    [sheets.scenarioA, "A5:E44"],
    [sheets.scenarioB, "A5:E44"],
    [sheets.references, "A5:C16"],
  ]) {
    const check = await workbook.inspect({
      kind: "table",
      sheetId: sheetName,
      range,
      include: "values,formulas",
      tableMaxRows: 50,
      tableMaxCols: 8,
      maxChars: 18000,
    });
    keyChecks.push({ sheetName, range, ndjson: check.ndjson });
  }
  const hardErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: `${source.key} hard formula error scan`,
    maxChars: 10000,
  });

  for (const sheet of workbook.worksheets.items) {
    const safeName = sheet.name.replace(/[\\/:*?"<>|]/g, "_");
    const preview = await workbook.render({
      sheetName: sheet.name,
      autoCrop: "all",
      scale: 0.8,
      format: "png",
    });
    await fs.writeFile(
      path.join(previewDir, `${source.key}_${safeName}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }

  const outputPath = path.join(outputDir, config.outputName);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
  const reopenCheck = await reopened.inspect({
    kind: "table",
    sheetId: sheets.scenarioA,
    range: "A18:E33",
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 5,
    maxChars: 10000,
  });
  verification[source.key] = {
    outputPath,
    hardErrors: hardErrors.ndjson,
    keyChecks,
    reopenCheck: reopenCheck.ndjson,
  };
}

verification.expectedFixedFeeRevenueJPYm = {
  conservative: [29.4, 88.2, 176.4],
  highGrowth: [58.8, 176.4, 352.8],
};
verification.initialIntroducerAdvertisingFeeJPYm = [0.03, 0, 0];
await fs.writeFile(path.join(workDir, "verification.json"), JSON.stringify(verification, null, 2));
console.log(JSON.stringify({
  outputs: Object.values(verification).filter((value) => value?.outputPath).map((value) => value.outputPath),
  expectedFixedFeeRevenueJPYm: verification.expectedFixedFeeRevenueJPYm,
  initialIntroducerAdvertisingFeeJPYm: verification.initialIntroducerAdvertisingFeeJPYm,
}, null, 2));
