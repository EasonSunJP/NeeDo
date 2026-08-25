import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const filePath = path.join(
  "/Users/eason/Documents/New project/outputs/01a01893-cba2-7063-ab00-e9f8e301040a",
  "NeeDo_三年财务模型_CN_V2.1_2026-08-22.xlsx",
);
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
const annual = workbook.worksheets.getItem("三年PL");
const assumptions = workbook.worksheets.getItem("参数设置");
const engineA = workbook.worksheets.getItem("A_36个月模型");
const engineB = workbook.worksheets.getItem("B_36个月模型");

const sum = (values) => values.flat().reduce((total, value) => total + (Number(value) || 0), 0);
console.log(JSON.stringify({
  displayedAnnualMetrics: {
    labels: annual.getRange("A5:B11").values,
    values: annual.getRange("C5:H11").values,
    formulas: annual.getRange("C5:H11").formulas,
  },
  actualOrderCounts: {
    A: [sum(engineA.getRange("C31:N31").values), sum(engineA.getRange("O31:Z31").values), sum(engineA.getRange("AA31:AL31").values)],
    B: [sum(engineB.getRange("C31:N31").values), sum(engineB.getRange("O31:Z31").values), sum(engineB.getRange("AA31:AL31").values)],
  },
  unmetForeignOrders: {
    A: [sum(engineA.getRange("C36:N36").values), sum(engineA.getRange("O36:Z36").values), sum(engineA.getRange("AA36:AL36").values)],
    B: [sum(engineB.getRange("C36:N36").values), sum(engineB.getRange("O36:Z36").values), sum(engineB.getRange("AA36:AL36").values)],
  },
  annualInputs: assumptions.getRange("A6:I79").values,
}, null, 2));
