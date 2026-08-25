import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "/Users/eason/Documents/New project/outputs/01a01893-cba2-7063-ab00-e9f8e301040a";
const verifyDir = "/Users/eason/Documents/New project/.codex_tmp/needo_pl_9800/focused_after";
await fs.mkdir(verifyDir, { recursive: true });

const books = [
  {
    key: "jp",
    path: path.join(outputDir, "NeeDo_3カ年財務モデル_JP_V1.5_2026-08-19_日本語版.xlsx"),
    assumptions: "前提条件",
    dashboard: "ダッシュボード",
    scenarioA: "シナリオA（保守）",
    scenarioB: "シナリオB（高成長）",
  },
  {
    key: "cn",
    path: path.join(outputDir, "NeeDo_三年财务模型_CN_V1.5_2026-08-19.xlsx"),
    assumptions: "参数设置",
    dashboard: "首页仪表盘",
    scenarioA: "方案A（保守）",
    scenarioB: "方案B（高速增长）",
  },
];

const report = {};
for (const book of books) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(book.path));
  const assumptions = workbook.worksheets.getItem(book.assumptions);
  const dashboard = workbook.worksheets.getItem(book.dashboard);
  const scenarioA = workbook.worksheets.getItem(book.scenarioA);
  const scenarioB = workbook.worksheets.getItem(book.scenarioB);
  report[book.key] = {
    dashboardValues: dashboard.getRange("A1:A2").values,
    assumptionsTopValues: assumptions.getRange("A13:H18").values,
    assumptionsBottomValues: assumptions.getRange("A49:H56").values,
    scenarioAFixedRevenueFormulas: scenarioA.getRange("B20:D20").formulas,
    scenarioAAdvertisingFormulas: scenarioA.getRange("B33:D33").formulas,
    scenarioBFixedRevenueFormulas: scenarioB.getRange("B20:D20").formulas,
    scenarioBAdvertisingFormulas: scenarioB.getRange("B33:D33").formulas,
  };
  for (const [label, range] of [
    ["assumptions_top", "A1:H20"],
    ["assumptions_bottom", "A49:H57"],
    ["scenario_a", "A1:E44"],
  ]) {
    const preview = await workbook.render({
      sheetName: label.startsWith("assumptions") ? book.assumptions : book.scenarioA,
      range,
      scale: 1.2,
      format: "png",
    });
    await fs.writeFile(
      path.join(verifyDir, `${book.key}_${label}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }
  const dashboardPreview = await workbook.render({
    sheetName: book.dashboard,
    range: "A1:M23",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(
    path.join(verifyDir, `${book.key}_dashboard.png`),
    new Uint8Array(await dashboardPreview.arrayBuffer()),
  );
}

await fs.writeFile(path.join(verifyDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
