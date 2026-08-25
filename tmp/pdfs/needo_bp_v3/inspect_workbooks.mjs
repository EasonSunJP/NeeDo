import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile } from "@oai/artifact-tool";

const root = "/Users/eason/Documents/New project";
const compPath = path.join(root, "outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本核心功能_简化调整对比_V4.2_2026-08-13.xlsx");
const finPath = path.join(root, "outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_三年财务模型_V1.4_外国用户保守化及广告强化版_2026-08-14.xlsx");

const comp = await SpreadsheetFile.importXlsx(await fs.readFile(compPath));
const fin = await SpreadsheetFile.importXlsx(await fs.readFile(finPath));

console.log("COMP_SHEETS", (await comp.inspect({ kind: "sheet", include: "id,name" })).ndjson);
console.log("FIN_SHEETS", (await fin.inspect({ kind: "sheet", include: "id,name" })).ndjson);

const compTable = await comp.inspect({
  kind: "table",
  range: "核心功能总表!A1:AG26",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 40,
});
console.log("COMP_TABLE");
console.log(compTable.ndjson);

for (const range of [
  "参数设置!A1:H81",
  "方案A（保守）!A1:E44",
  "方案B（高速增长）!A1:E44",
  "经营指标!A1:H18",
]) {
  const result = await fin.inspect({
    kind: "table",
    range,
    include: "values,formulas",
    tableMaxRows: 100,
    tableMaxCols: 12,
  });
  console.log(`FIN_TABLE ${range}`);
  console.log(result.ndjson);
}
