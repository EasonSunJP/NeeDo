import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本核心功能_简化调整对比_V4.2_2026-08-13.xlsx";
const input = await FileBlob.load(source);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "sheet,table",
  include: "id,name,range",
  maxChars: 6000,
  tableMaxRows: 4,
  tableMaxCols: 8,
});
console.log(overview.ndjson);

for (const sheetName of ["核心功能对比", "费用对比", "主表", "核心赛道总表", "料金比較"]) {
  try {
    const region = await workbook.inspect({
      kind: "region",
      sheetId: sheetName,
      range: "A1:AZ40",
      maxChars: 20000,
      tableMaxRows: 40,
      tableMaxCols: 52,
    });
    console.log(`SHEET=${sheetName}`);
    console.log(region.ndjson);
  } catch {
    // Sheet names differ between workbook versions; silently continue.
  }
}
