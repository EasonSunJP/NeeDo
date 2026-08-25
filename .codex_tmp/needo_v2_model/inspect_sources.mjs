import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const workDir = path.join(root, ".codex_tmp/needo_v2_model");
const previewDir = path.join(workDir, "previews_before");
await fs.mkdir(previewDir, { recursive: true });

const books = [
  {
    key: "jp",
    path: path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a/NeeDo_3カ年財務モデル_JP_V1.5_2026-08-19_日本語版.xlsx"),
    assumptions: "前提条件",
    scenarioA: "シナリオA（保守）",
    scenarioB: "シナリオB（高成長）",
    cost: "コスト試算",
    ramp: "月次店舗ランプ",
  },
  {
    key: "cn",
    path: path.join(root, "outputs/01a01893-cba2-7063-ab00-e9f8e301040a/NeeDo_三年财务模型_CN_V1.5_2026-08-19.xlsx"),
    assumptions: "参数设置",
    scenarioA: "方案A（保守）",
    scenarioB: "方案B（高速增长）",
    cost: "成本测算",
    ramp: "月度店铺爬坡",
  },
];

const report = {};
for (const book of books) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(book.path));
  const sheets = workbook.worksheets.items.map((sheet) => sheet.name);
  const assumptions = workbook.worksheets.getItem(book.assumptions);
  const scenarioA = workbook.worksheets.getItem(book.scenarioA);
  const scenarioB = workbook.worksheets.getItem(book.scenarioB);
  const cost = workbook.worksheets.getItem(book.cost);
  const ramp = workbook.worksheets.getItem(book.ramp);
  report[book.key] = {
    sheets,
    assumptions: assumptions.getRange("A1:H81").values,
    assumptionsFormulas: assumptions.getRange("A1:H81").formulas,
    scenarioA: scenarioA.getRange("A1:E44").values,
    scenarioAFormulas: scenarioA.getRange("A1:E44").formulas,
    scenarioB: scenarioB.getRange("A1:E44").values,
    scenarioBFormulas: scenarioB.getRange("A1:E44").formulas,
    cost: cost.getRange("A1:H25").values,
    costFormulas: cost.getRange("A1:H25").formulas,
    ramp: ramp.getRange("A1:T39").values,
    rampFormulas: ramp.getRange("A1:T39").formulas,
  };
  for (const sheet of workbook.worksheets.items) {
    const safeName = sheet.name.replace(/[\\/:*?"<>|]/g, "_");
    const preview = await workbook.render({
      sheetName: sheet.name,
      autoCrop: "all",
      scale: 0.7,
      format: "png",
    });
    await fs.writeFile(
      path.join(previewDir, `${book.key}_${safeName}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }
}

await fs.writeFile(path.join(workDir, "source_report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  jpSheets: report.jp.sheets,
  cnSheets: report.cn.sheets,
  output: path.join(workDir, "source_report.json"),
}, null, 2));
