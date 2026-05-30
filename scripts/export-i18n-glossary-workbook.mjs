import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspaceRoot = "/Users/eason/Documents/New project";
const glossaryDocFile = path.join(workspaceRoot, "docs", "i18n-terminology-glossary.md");
const outputDir = path.join(workspaceRoot, "exports", "i18n");
const workbookFile = path.join(outputDir, "needo-terminology-glossary.xlsx");

const glossaryHeaders = ["简体中文", "繁体中文", "日语", "English", "한국어", "备注", "适用范围", "锁定级别", "订正状态"];

function parseMarkdownTableRow(line) {
  const trimmed = line.trim();

  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }

  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function isCoreGlossaryHeader(cells) {
  return cells.length >= 6 && cells[0] === "简体中文" && cells[1] === "繁体中文" && cells[2] === "日语" && cells[3] === "English" && cells[4] === "한국어";
}

function parseCoreGlossary(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const rows = [];
  let inCoreTable = false;
  let sawHeader = false;

  for (const line of lines) {
    const cells = parseMarkdownTableRow(line);

    if (!cells) {
      if (inCoreTable) {
        break;
      }

      continue;
    }

    if (!sawHeader) {
      if (isCoreGlossaryHeader(cells)) {
        sawHeader = true;
        inCoreTable = true;
      }

      continue;
    }

    if (isSeparatorRow(cells)) {
      continue;
    }

    if (!inCoreTable || cells.length < 6 || !cells[0]) {
      continue;
    }

    rows.push([...cells.slice(0, 6), "核心术语", "现行锁定", "待订正确认"]);
  }

  if (rows.length === 0) {
    throw new Error(`未能从 ${glossaryDocFile} 解析到核心术语表。`);
  }

  return rows;
}

function addTitle(sheet, title, subtitle, columnCount) {
  const lastColumn = getExcelColumnName(columnCount - 1);
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1").format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center"
  };
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2").format = {
    fill: "#E0F2FE",
    font: { color: "#0F172A" },
    horizontalAlignment: "left",
    verticalAlignment: "center"
  };
}

function formatTable(sheet, startRowNumber, rowCount, columnCount) {
  const lastColumn = getExcelColumnName(columnCount - 1);
  const headerRange = `A${startRowNumber}:${lastColumn}${startRowNumber}`;
  const bodyEndRow = startRowNumber + rowCount;

  sheet.getRange(headerRange).format = {
    fill: "#1D4ED8",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center"
  };
  sheet.getRange(`A${startRowNumber + 1}:${lastColumn}${bodyEndRow}`).format.wrapText = true;
  sheet.getRange(`A${startRowNumber}:${lastColumn}${bodyEndRow}`).format.autofitColumns();
  sheet.getRange(`A${startRowNumber}:F${bodyEndRow}`).format.columnWidthPx = 220;
  sheet.getRange(`F${startRowNumber}:F${bodyEndRow}`).format.columnWidthPx = 360;
  sheet.getRange(`G${startRowNumber}:I${bodyEndRow}`).format.columnWidthPx = 150;
  sheet.getRange(`G${startRowNumber + 1}:I${bodyEndRow}`).format.horizontalAlignment = "center";
  sheet.freezePanes.freezeRows(startRowNumber);
  sheet.showGridLines = false;
}

function buildWorkbook(rows) {
  const workbook = Workbook.create();
  const glossarySheet = workbook.worksheets.add("用语集");

  addTitle(
    glossarySheet,
    "NeeDo 多语言用语集",
    "只订正这张表的术语译法；确认后可同步到主多语言表与应用翻译锁定规则。",
    glossaryHeaders.length
  );
  glossarySheet.getRangeByIndexes(3, 0, 1, glossaryHeaders.length).values = [glossaryHeaders];
  glossarySheet.getRangeByIndexes(4, 0, rows.length, glossaryHeaders.length).values = rows;
  formatTable(glossarySheet, 4, rows.length, glossaryHeaders.length);

  const guideSheet = workbook.worksheets.add("维护说明");
  const guideRows = [
    ["项目", "说明"],
    ["订正入口", "请优先修改「用语集」工作表里的繁体中文、日语、English、한국어 与备注。"],
    ["不要删除", "简体中文列是主键，请不要删除或改成空白；如需新增术语，在表尾追加新行。"],
    ["同步方式", "把订正后的 xlsx 交给 Codex，可同步到 docs/i18n-terminology-glossary.md、主多语言表和 approved overrides。"],
    ["主多语言表", "exports/i18n/needo-localization-workbook.xlsx"],
    ["人工锁定", "已确认术语会进入 scripts/i18n-approved-overrides.mjs，避免 workbook import 后被旧翻译覆盖。"]
  ];
  guideSheet.getRangeByIndexes(0, 0, guideRows.length, 2).values = guideRows;
  guideSheet.getRange("A1:B1").format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center"
  };
  guideSheet.getRange(`A2:B${guideRows.length}`).format.wrapText = true;
  guideSheet.getRange(`A1:B${guideRows.length}`).format.autofitColumns();
  guideSheet.getRange(`A1:A${guideRows.length}`).format.columnWidthPx = 160;
  guideSheet.getRange(`B1:B${guideRows.length}`).format.columnWidthPx = 720;
  guideSheet.freezePanes.freezeRows(1);
  guideSheet.showGridLines = false;

  return workbook;
}

function getExcelColumnName(index) {
  let columnNumber = index + 1;
  let columnName = "";

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return columnName;
}

async function main() {
  const markdown = await fs.readFile(glossaryDocFile, "utf8");
  const rows = parseCoreGlossary(markdown);
  const workbook = buildWorkbook(rows);
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);

  await fs.mkdir(outputDir, { recursive: true });
  await xlsx.save(workbookFile);

  console.log(
    JSON.stringify(
      {
        workbookFile,
        sheetCount: workbook.worksheets.items.length,
        termCount: rows.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
