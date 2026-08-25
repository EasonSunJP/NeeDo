import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const outputDir = path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a");
const cases = [
  {
    key: "jp",
    file: "NeeDo_3カ年財務モデル_JP_V2.2_2026-08-22_日本語版.xlsx",
    sheets: ["ダッシュボード", "前提条件", "A_36か月モデル", "B_36か月モデル", "Y1月次PL", "3カ年PL", "キャッシュフロー", "チェック", "定義・出典"],
    assumptions: "前提条件", checks: "チェック", annual: "3カ年PL", engineA: "A_36か月モデル", engineB: "B_36か月モデル",
  },
  {
    key: "cn",
    file: "NeeDo_三年财务模型_CN_V2.2_2026-08-22.xlsx",
    sheets: ["首页仪表盘", "参数设置", "A_36个月模型", "B_36个月模型", "第一年月度PL", "三年PL", "现金流", "检查", "口径与来源"],
    assumptions: "参数设置", checks: "检查", annual: "三年PL", engineA: "A_36个月模型", engineB: "B_36个月模型",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sum(values) {
  return values.flat().filter((value) => typeof value === "number").reduce((total, value) => total + value, 0);
}

const report = {};
for (const item of cases) {
  const filePath = path.join(outputDir, item.file);
  const stat = await fs.stat(filePath);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const names = workbook.worksheets.items.map((sheet) => sheet.name);
  assert(JSON.stringify(names) === JSON.stringify(item.sheets), `${item.key}: worksheet list mismatch`);

  const assumptions = workbook.worksheets.getItem(item.assumptions);
  const checks = workbook.worksheets.getItem(item.checks);
  const annual = workbook.worksheets.getItem(item.annual);
  const engineA = workbook.worksheets.getItem(item.engineA);
  const engineB = workbook.worksheets.getItem(item.engineB);

  assert(assumptions.getRange("C12").values[0][0] === 9800, `${item.key}: store fee`);
  assert(assumptions.getRange("C13").values[0][0] === 6, `${item.key}: contract term`);
  assert(assumptions.getRange("C14").values[0][0] === 30000, `${item.key}: referral fee`);
  assert(assumptions.getRange("C19").values[0][0] === 7, `${item.key}: diversification start`);
  assert(JSON.stringify(assumptions.getRange("C20:C22").values.flat()) === JSON.stringify([1, 0, 0]), `${item.key}: launch channel mix`);
  assert(JSON.stringify(assumptions.getRange("C23:E23").values[0]) === JSON.stringify([0.4, 0.15, 0.05]), `${item.key}: sales/referral end mix`);
  assert(JSON.stringify(assumptions.getRange("C24:E24").values[0]) === JSON.stringify([0.35, 0.6, 0.7]), `${item.key}: organic end mix`);
  assert(JSON.stringify(assumptions.getRange("C25:E25").values[0]) === JSON.stringify([0.25, 0.25, 0.25]), `${item.key}: ad/event end mix`);
  assert(assumptions.getRange("C64:H64").values.flat().every((v) => v === 0), `${item.key}: hotel share not zero`);
  assert(assumptions.getRange("C70").values[0][0] === 250000, `${item.key}: server baseline`);
  assert(assumptions.getRange("C73").values[0][0] === 20000000, `${item.key}: initial development`);
  assert(JSON.stringify(assumptions.getRange("C74:E75").values) === JSON.stringify([[1, 3, 6], [3, 6, 10]]), `${item.key}: A R&D path`);
  assert(JSON.stringify(assumptions.getRange("F74:H75").values) === JSON.stringify([[1, 5, 10], [5, 10, 15]]), `${item.key}: B R&D path`);
  assert(assumptions.getRange("C76:H76").values.flat().every((v) => v === 700000), `${item.key}: R&D unit cost`);

  assert(checks.getRange("B2").values[0][0] === "PASS", `${item.key}: overall checks failed`);
  const detailed = checks.getRange("F6:F85").values.flat().filter(Boolean);
  assert(detailed.length === 80 && detailed.every((value) => value === "OK"), `${item.key}: detailed checks failed`);

  for (const [engine, label, endHeadcount] of [[engineA, "A", 3], [engineB, "B", 5]]) {
    assert(engine.getRange("C14:H14").values[0].every((v) => Math.abs(v - 1) < 1e-10), `${item.key}: ${label} first six sales mix`);
    assert(sum(engine.getRange("C15:H16").values) === 0, `${item.key}: ${label} first six non-sales mix`);
    const month12Mix = engine.getRange("N14:N16").values.flat();
    assert(Math.abs(month12Mix[0] - 0.4) < 1e-10 && Math.abs(month12Mix[1] - 0.35) < 1e-10 && Math.abs(month12Mix[2] - 0.25) < 1e-10, `${item.key}: ${label} month 12 mix`);
    assert(engine.getRange("C53").values[0][0] === 20000000, `${item.key}: ${label} M01 development`);
    assert(engine.getRange("D53:AL53").values[0].every((v) => v === 0), `${item.key}: ${label} development after M01`);
    assert(engine.getRange("C54").values[0][0] === 1 && engine.getRange("N54").values[0][0] === endHeadcount, `${item.key}: ${label} Y1 R&D ramp`);
    assert(engine.getRange("N59").values[0][0] > engine.getRange("C59").values[0][0], `${item.key}: ${label} server does not grow`);
    assert(sum(engine.getRange("C49:AL49").values) === 0 && sum(engine.getRange("C71:AL71").values) === 0, `${item.key}: ${label} hotel amounts`);
  }

  const aOrders = annual.getRange("C9:E9").values[0];
  const bOrders = annual.getRange("F9:H9").values[0];
  assert(aOrders.every((v) => v > 100000) && bOrders.every((v) => v > 100000), `${item.key}: order counts still scaled`);
  assert(Math.abs(aOrders[0] - sum(engineA.getRange("C34:N34").values)) < 0.01, `${item.key}: A annual orders tie`);
  assert(Math.abs(bOrders[0] - sum(engineB.getRange("C34:N34").values)) < 0.01, `${item.key}: B annual orders tie`);
  assert(annual.getRange("C10:H10").values[0].every((v) => v >= 0 && v <= 12), `${item.key}: eKYC months display`);
  for (const col of ["I", "J", "K", "L", "M", "N"]) {
    assert(Math.abs(sum(annual.getRange(`${col}15:${col}23`).values) - 1) < 1e-8, `${item.key}: ${col} revenue shares`);
    assert(Math.abs(sum(annual.getRange(`${col}27:${col}41`).values) - 1) < 1e-8, `${item.key}: ${col} expense shares`);
  }

  const criticalFormulas = [engineA.getRange("C14").formulas[0][0], engineA.getRange("C54").formulas[0][0], engineA.getRange("C55").formulas[0][0], engineB.getRange("N59").formulas[0][0], annual.getRange("C9").formulas[0][0], annual.getRange("I15").formulas[0][0]];
  assert(criticalFormulas.every((formula) => typeof formula === "string" && formula.startsWith("=")), `${item.key}: formula preservation`);
  const hardErrors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!", options: { useRegex: true, maxResults: 1000 }, summary: "V2.2 reopened formula scan" });
  const errorText = typeof hardErrors === "string" ? hardErrors : JSON.stringify(hardErrors);
  assert(errorText.includes("matched 0 entries"), `${item.key}: formula error`);

  report[item.key] = {
    file: filePath, bytes: stat.size, sheets: names.length, checks: detailed.length,
    outcomes: {
      annualOrdersA: aOrders, annualOrdersB: bOrders,
      eKycActiveMonthsA: annual.getRange("C10:E10").values[0], eKycActiveMonthsB: annual.getRange("F10:H10").values[0],
      unmetForeignOrdersA: annual.getRange("C11:E11").values[0], unmetForeignOrdersB: annual.getRange("F11:H11").values[0],
      annualRevenueA: annual.getRange("C24:E24").values[0], annualRevenueB: annual.getRange("F24:H24").values[0],
      annualOperatingProfitA: annual.getRange("C45:E45").values[0], annualOperatingProfitB: annual.getRange("F45:H45").values[0],
      annualMarginA: annual.getRange("C46:E46").values[0], annualMarginB: annual.getRange("F46:H46").values[0],
      serverM01M12A: [engineA.getRange("C59").values[0][0], engineA.getRange("N59").values[0][0]],
      serverM01M12B: [engineB.getRange("C59").values[0][0], engineB.getRange("N59").values[0][0]],
      rndY1CostA: sum(engineA.getRange("C55:N55").values), rndY1CostB: sum(engineB.getRange("C55:N55").values),
      firstEkycMonthA: engineA.getRange("C37:AL37").values[0].findIndex((v) => v === 1) + 1,
      firstEkycMonthB: engineB.getRange("C37:AL37").values[0].findIndex((v) => v === 1) + 1,
    },
    formulaErrorMatches: 0,
  };
}

const reportPath = path.join(root, ".codex_tmp/needo_v2_model/verification_report_v22.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, report }, null, 2));
