import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const outputDir = path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a");
const cases = [
  {
    key: "jp",
    file: "NeeDo_3カ年財務モデル_JP_V2.1_2026-08-22_日本語版.xlsx",
    sheets: ["ダッシュボード", "前提条件", "A_36か月モデル", "B_36か月モデル", "Y1月次PL", "3カ年PL", "キャッシュフロー", "チェック", "定義・出典"],
    assumptions: "前提条件",
    checks: "チェック",
    annual: "3カ年PL",
    engineA: "A_36か月モデル",
    engineB: "B_36か月モデル",
  },
  {
    key: "cn",
    file: "NeeDo_三年财务模型_CN_V2.1_2026-08-22.xlsx",
    sheets: ["首页仪表盘", "参数设置", "A_36个月模型", "B_36个月模型", "第一年月度PL", "三年PL", "现金流", "检查", "口径与来源"],
    assumptions: "参数设置",
    checks: "检查",
    annual: "三年PL",
    engineA: "A_36个月模型",
    engineB: "B_36个月模型",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = {};
for (const item of cases) {
  const filePath = path.join(outputDir, item.file);
  const stat = await fs.stat(filePath);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const sheetNames = workbook.worksheets.items.map((sheet) => sheet.name);
  assert(JSON.stringify(sheetNames) === JSON.stringify(item.sheets), `${item.key}: worksheet list mismatch`);

  const assumptions = workbook.worksheets.getItem(item.assumptions);
  const checks = workbook.worksheets.getItem(item.checks);
  const annual = workbook.worksheets.getItem(item.annual);
  const engineA = workbook.worksheets.getItem(item.engineA);
  const engineB = workbook.worksheets.getItem(item.engineB);

  assert(assumptions.getRange("C12").values[0][0] === 9800, `${item.key}: store fee is not 9,800`);
  assert(assumptions.getRange("C13").values[0][0] === 6, `${item.key}: minimum contract is not six months`);
  assert(assumptions.getRange("C14").values[0][0] === 30000, `${item.key}: success fee is not 30,000`);
  assert(assumptions.getRange("C9").values[0][0] === 7, `${item.key}: eKYC earliest month is not month 7`);
  assert(assumptions.getRange("C64").values[0][0] === 250000, `${item.key}: server fixed baseline is not 250,000/month`);
  assert(assumptions.getRange("C65").values[0][0] === 15, `${item.key}: per-order server driver is not 15`);
  assert(assumptions.getRange("C66").values[0][0] === 10, `${item.key}: per-account server driver is not 10`);
  assert(assumptions.getRange("C67").values[0][0] === 20000000, `${item.key}: M01 development input is not 20,000,000`);
  assert(assumptions.getRange("D67:E67").values[0].every((value) => value === 0), `${item.key}: A Y2/Y3 development inputs are not zero`);
  assert(assumptions.getRange("F67").values[0][0] === 20000000, `${item.key}: B M01 development input is not 20,000,000`);
  assert(assumptions.getRange("G67:H67").values[0].every((value) => value === 0), `${item.key}: B Y2/Y3 development inputs are not zero`);
  assert(Math.abs(assumptions.getRange("C16:C18").values.flat().reduce((sum, value) => sum + value, 0) - 1) < 1e-9, `${item.key}: A Y1 channel shares do not sum to 100%`);
  assert(Math.abs(assumptions.getRange("F16:F18").values.flat().reduce((sum, value) => sum + value, 0) - 1) < 1e-9, `${item.key}: B Y1 channel shares do not sum to 100%`);
  assert(JSON.stringify(assumptions.getRange("F35:H35").values[0]) === JSON.stringify([1200, 3000, 6000]), `${item.key}: B store targets mismatch`);
  assert(checks.getRange("B2").values[0][0] === "PASS", `${item.key}: model checks did not pass`);

  const checkRows = checks.getRange("F6:F44").values.flat().filter(Boolean);
  assert(checkRows.length === 39 && checkRows.every((value) => value === "OK"), `${item.key}: one or more detailed checks failed`);

  assert(engineA.getRange("C50").values[0][0] === 20000000, `${item.key}: A development cost missing in M01`);
  assert(engineB.getRange("C50").values[0][0] === 20000000, `${item.key}: B development cost missing in M01`);
  assert(engineA.getRange("D50:AL50").values[0].every((value) => value === 0), `${item.key}: A development cost appears after M01`);
  assert(engineB.getRange("D50:AL50").values[0].every((value) => value === 0), `${item.key}: B development cost appears after M01`);
  assert(engineA.getRange("N54").values[0][0] >= engineA.getRange("C54").values[0][0], `${item.key}: A server cost does not rise with usage`);
  assert(engineB.getRange("N54").values[0][0] >= engineB.getRange("C54").values[0][0], `${item.key}: B server cost does not rise with usage`);

  const formulaSamples = [
    engineA.getRange("C39").formulas[0][0],
    engineA.getRange("C50").formulas[0][0],
    engineA.getRange("C54").formulas[0][0],
    engineA.getRange("C60").formulas[0][0],
    engineA.getRange("C61").formulas[0][0],
    engineB.getRange("C39").formulas[0][0],
    engineB.getRange("C50").formulas[0][0],
    engineB.getRange("N54").formulas[0][0],
    annual.getRange("F42").formulas[0][0],
  ];
  assert(formulaSamples.every((formula) => typeof formula === "string" && formula.startsWith("=")), `${item.key}: critical formulas were not preserved after export`);

  const hardErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 1000 },
    summary: "Reopened V2.1 XLSX formula error scan",
  });
  const errorText = typeof hardErrors === "string" ? hardErrors : JSON.stringify(hardErrors);
  assert(errorText.includes("matched 0 entries"), `${item.key}: formula error scan found an issue`);

  report[item.key] = {
    file: filePath,
    bytes: stat.size,
    sheets: sheetNames.length,
    status: checks.getRange("B2").values[0][0],
    detailedChecks: checkRows.length,
    assumptions: {
      monthlyStoreFee: assumptions.getRange("C12").values[0][0],
      minimumContractMonths: assumptions.getRange("C13").values[0][0],
      successFeePerSalesReferralStore: assumptions.getRange("C14").values[0][0],
      serverFixedPerMonth: assumptions.getRange("C64").values[0][0],
      serverPerOrder: assumptions.getRange("C65").values[0][0],
      serverPerActiveAccountMonth: assumptions.getRange("C66").values[0][0],
      developmentCostM01Only: assumptions.getRange("C67").values[0][0],
      scenarioBStoreTargets: assumptions.getRange("F35:H35").values[0],
    },
    outcomes: {
      scenarioAEkycStartMonth: annual.getRange("C10").values[0][0],
      scenarioBEkycStartMonth: annual.getRange("F10").values[0][0],
      scenarioAServerM01: engineA.getRange("C54").values[0][0],
      scenarioAServerM12: engineA.getRange("N54").values[0][0],
      scenarioBServerM01: engineB.getRange("C54").values[0][0],
      scenarioBServerM12: engineB.getRange("N54").values[0][0],
      scenarioAOperatingProfit: annual.getRange("C42:E42").values[0],
      scenarioBOperatingProfit: annual.getRange("F42:H42").values[0],
    },
    formulaErrorMatches: 0,
  };
}

const reportPath = path.join(root, ".codex_tmp/needo_v2_model/verification_report_v21.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, report }, null, 2));
