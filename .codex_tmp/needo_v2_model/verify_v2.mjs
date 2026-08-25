import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const outputDir = path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a");
const cases = [
  {
    key: "jp",
    file: "NeeDo_3カ年財務モデル_JP_V2.0_2026-08-21_日本語版.xlsx",
    sheets: ["ダッシュボード", "前提条件", "A_36か月モデル", "B_36か月モデル", "Y1月次PL", "3カ年PL", "キャッシュフロー", "チェック", "定義・出典"],
    assumptions: "前提条件",
    checks: "チェック",
    engineA: "A_36か月モデル",
    engineB: "B_36か月モデル",
  },
  {
    key: "cn",
    file: "NeeDo_三年财务模型_CN_V2.0_2026-08-21.xlsx",
    sheets: ["首页仪表盘", "参数设置", "A_36个月模型", "B_36个月模型", "第一年月度PL", "三年PL", "现金流", "检查", "口径与来源"],
    assumptions: "参数设置",
    checks: "检查",
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
  const engineA = workbook.worksheets.getItem(item.engineA);
  const engineB = workbook.worksheets.getItem(item.engineB);

  assert(assumptions.getRange("C12").values[0][0] === 9800, `${item.key}: store fee is not 9,800`);
  assert(assumptions.getRange("C13").values[0][0] === 6, `${item.key}: minimum contract is not six months`);
  assert(assumptions.getRange("C14").values[0][0] === 30000, `${item.key}: success fee is not 30,000`);
  assert(assumptions.getRange("C9").values[0][0] === 7, `${item.key}: eKYC earliest month is not month 7`);
  assert(assumptions.getRange("C60").values[0][0] === 12000000, `${item.key}: server baseline missing`);
  assert(assumptions.getRange("C61").values[0][0] === 12, `${item.key}: per-order server driver missing`);
  assert(assumptions.getRange("C62").values[0][0] === 120, `${item.key}: per-account server driver missing`);
  assert(checks.getRange("B2").values[0][0] === "PASS", `${item.key}: model checks did not pass`);

  const checkRows = checks.getRange("F6:F28").values.flat().filter(Boolean);
  assert(checkRows.length === 23 && checkRows.every((value) => value === "OK"), `${item.key}: one or more detailed checks failed`);

  const formulaSamples = [
    engineA.getRange("C36").formulas[0][0],
    engineA.getRange("C51").formulas[0][0],
    engineA.getRange("C57").formulas[0][0],
    engineA.getRange("I31").formulas[0][0],
    engineB.getRange("C36").formulas[0][0],
    engineB.getRange("C51").formulas[0][0],
    engineB.getRange("C57").formulas[0][0],
    engineB.getRange("I31").formulas[0][0],
  ];
  assert(formulaSamples.every((formula) => typeof formula === "string" && formula.startsWith("=")), `${item.key}: critical formulas were not preserved after export`);

  const hardErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 1000 },
    summary: "Reopened XLSX formula error scan",
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
      successFeePerNewStore: assumptions.getRange("C14").values[0][0],
      ekycEarliestMonth: assumptions.getRange("C9").values[0][0],
    },
    formulaErrorMatches: 0,
  };
}

const reportPath = path.join(root, ".codex_tmp/needo_v2_model/verification_report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, report }, null, 2));
