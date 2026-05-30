import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import {
  compareFeatureKeys,
  getFeatureSheetTitle,
  inferFeatureKey,
  workbookFeatureSheets,
  workbookHeaders
} from "./i18n-workbook-config.mjs";

const workspaceRoot = "/Users/eason/Documents/New project";
const sourceFile = path.join(workspaceRoot, "src/i18n/translations.ts");
const outputDir = path.join(workspaceRoot, "exports", "i18n");
const tempModuleFile = path.join(outputDir, "translations.export.temp.mjs");
const workbookFile = path.join(outputDir, "needo-localization-workbook.xlsx");
const sourceDirectories = [path.join(workspaceRoot, "src"), path.join(workspaceRoot, "scripts")];

const codeFileExtensions = new Set([".ts", ".tsx", ".mjs"]);
const excludedFilePatterns = [
  /src\/i18n\/translations\.ts$/u,
  /\.test\.(ts|tsx)$/u,
  /scripts\/export-i18n-workbook\.mjs$/u,
  /scripts\/export-i18n-glossary-workbook\.mjs$/u
];
const usageExampleLimit = 6;
const manuallyReviewedJapaneseSourceTexts = new Set([
  "信用",
  "信用值",
  "信用值、积分和利用次数仍由系统自动计算，这一页只编辑用户公开资料本身。",
  "信用值待完善",
  "信用评价",
  "信用评价、积分和利用次数仍由系统自动计算，这一页只编辑用户公开资料本身。",
  "信用评分",
  "信用评分待完善",
  "担当/员工交代",
  "切换技师",
  "指派技师",
  "完成",
  "取消"
]);

const fileUsageLabelByBaseName = {
  AdminNotificationsPage: "平台后台 / 通知公告",
  AdminSupportPage: "平台后台 / 帮助支持",
  AnalyticsPage: "平台后台 / 数据分析",
  AvatarBadgesPage: "平台后台 / 头像徽章",
  CarouselPage: "平台后台 / 轮播管理",
  CategoryPage: "用户端 / 分类页",
  CheckoutPage: "用户端 / 预约结算页",
  ContactsPage: "用户端 / 通讯录",
  DashboardPage: "平台后台 / 总览",
  HomePage: "用户端 / 首页",
  MerchantAdminDashboardPage: "商户后台 / 总览",
  MerchantAdminSettingsPage: "商户后台 / 门店设置",
  MerchantPortalPage: "商户端 / 我的",
  MessagesPage: "用户端 / 聊天",
  MomentsPage: "移动端 / 动态",
  NeedoExchangePage: "移动端 / NeeDo 交易",
  NeedoRoutePages: "移动端 / NeeDo 页面",
  ProfileDetailPage: "用户端 / 资料详情",
  SearchPage: "用户端 / 搜索",
  ServiceDetailPage: "用户端 / 服务详情",
  ServiceListPage: "用户端 / 服务列表",
  StoreDetailPage: "用户端 / 店铺详情",
  StoreListPage: "用户端 / 店铺列表",
  SupportPage: "用户端 / 帮助支持",
  TechnicianPortalPage: "技师端 / 我的",
  UnifiedSettingsPages: "统一设置页",
  UserCenterPage: "用户端 / 我的",
  UserOrderDetailPage: "用户端 / 订单详情",
  UserOrdersPage: "用户端 / 订单列表",
  UserSettingsPages: "用户端 / 设置"
};

function normalizeText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function isSpreadsheetErrorValue(value) {
  const normalized = String(value ?? "").trim().toUpperCase();

  return (
    normalized === "#NAME?" ||
    normalized === "#VALUE!" ||
    normalized === "#REF!" ||
    normalized === "#DIV/0!" ||
    normalized === "#N/A" ||
    normalized === "#NUM!" ||
    normalized === "#NULL!" ||
    normalized === "#SPILL!" ||
    normalized === "#CALC!"
  );
}

function looksLikeSpreadsheetFormula(value) {
  return String(value ?? "").trim().startsWith("=");
}

function extractIfErrorFallback(value) {
  const prefix = "=IFERROR(";

  if (!value.startsWith(prefix) || !value.endsWith(")")) {
    return null;
  }

  const inner = value.slice(prefix.length, -1);
  const commaIndex = findTopLevelComma(inner);

  if (commaIndex < 0) {
    return null;
  }

  const fallbackExpression = inner.slice(commaIndex + 1).trim();
  const literals = extractSpreadsheetStringLiterals(fallbackExpression);

  return literals.length > 0 ? literals.join("") : null;
}

function findTopLevelComma(value) {
  let depth = 0;
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (character === "\"") {
        if (value[index + 1] === "\"") {
          index += 1;
        } else {
          inString = false;
        }
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (character === "," && depth === 0) {
      return index;
    }
  }

  return -1;
}

function extractSpreadsheetStringLiterals(value) {
  const literals = [];

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\"") {
      continue;
    }

    let literal = "";
    index += 1;

    while (index < value.length) {
      const character = value[index];

      if (character === "\"") {
        if (value[index + 1] === "\"") {
          literal += "\"";
          index += 2;
          continue;
        }

        break;
      }

      literal += character;
      index += 1;
    }

    literals.push(literal);
  }

  return literals;
}

function normalizeWorkbookTranslationCell(value, fallback = "") {
  if (!value) {
    return fallback;
  }

  const trimmed = String(value).trim();
  const extracted = extractIfErrorFallback(trimmed);
  const normalized = String(extracted ?? trimmed).trim();

  if (!normalized || isSpreadsheetErrorValue(normalized) || looksLikeSpreadsheetFormula(normalized) || normalized.includes("__xludf.DUMMYFUNCTION")) {
    return fallback;
  }

  return normalized;
}

function containsCjk(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

function containsKana(value) {
  return /[\u3040-\u30ff]/u.test(value);
}

function containsHangul(value) {
  return /[\uac00-\ud7af]/u.test(value);
}

function looksLikeLocalizableText(value) {
  const text = normalizeText(value);

  if (!text || text.length < 2) {
    return false;
  }

  if (looksLikeCodeOrMarkupSnippet(text)) {
    return false;
  }

  if (!containsCjk(text) && !containsKana(text) && !containsHangul(text)) {
    return false;
  }

  if (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("/") ||
    text.startsWith("#") ||
    /^#[0-9A-Fa-f]{3,8}$/u.test(text) ||
    /^([A-Za-z0-9_-]+\.)+[A-Za-z0-9_-]+$/u.test(text)
  ) {
    return false;
  }

  if (/^[，。·：:、（）(){}\[\]\-%+\s]+$/u.test(text) || /^[，。·：:、]/u.test(text)) {
    return false;
  }

  return true;
}

function shouldKeepExistingTranslationKey(value) {
  const text = normalizeText(value);

  if (!text) {
    return false;
  }

  if (text.length < 2 && !containsCjk(text) && !containsKana(text) && !containsHangul(text)) {
    return false;
  }

  if (looksLikeCodeOrMarkupSnippet(text)) {
    return false;
  }

  return true;
}

function looksLikeCodeOrMarkupSnippet(value) {
  const text = value.trim();

  if (/^<!doctype\s+html\b/iu.test(text) || /<script\b/iu.test(text)) {
    return true;
  }

  if (/(xlsx|approved overrides|docs\/i18n-terminology-glossary\.md|主多语言表|订正入口|订正后的|不要删除|人工锁定|锁定级别|订正状态|现行锁定|待订正确认)/iu.test(text)) {
    return true;
  }

  if (/^\(?\(\)\s*=>/u.test(text)) {
    return true;
  }

  if (/^\[[A-Za-z0-9_-]+\]/u.test(text)) {
    return true;
  }

  if (
    text.length > 80 &&
    /(document\.|window\.|querySelector|NodeFilter|getComputedStyle|console\.|process\.|JSON\.stringify|=>|;\s*(const|let|var)\s)/u.test(text)
  ) {
    return true;
  }

  return false;
}

function classifySourceText(value) {
  const text = normalizeText(value);

  if (!looksLikeLocalizableText(text)) {
    return "ignore";
  }

  return containsKana(text) || containsHangul(text) ? "non_zh_source" : "zh_source";
}

function isExcludedFile(filePath) {
  return excludedFilePatterns.some((pattern) => pattern.test(filePath));
}

function toWorkspaceRelativePath(filePath) {
  return path.relative(workspaceRoot, filePath).replace(/\\/gu, "/");
}

function getLineOfPosition(source, position) {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function humanizeIdentifier(value) {
  return value
    .replace(/\.(tsx|ts|mjs)$/u, "")
    .replace(/Page$/u, " 页")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .trim();
}

function resolveFileUsageLabel(filePath) {
  const relativePath = toWorkspaceRelativePath(filePath);
  const baseName = path.basename(filePath).replace(/\.(tsx|ts|mjs)$/u, "");

  if (fileUsageLabelByBaseName[baseName]) {
    return fileUsageLabelByBaseName[baseName];
  }

  if (relativePath.startsWith("src/pages/user/")) {
    return `用户端 / ${humanizeIdentifier(baseName)}`;
  }

  if (relativePath.startsWith("src/pages/mobile/")) {
    return `移动端 / ${humanizeIdentifier(baseName)}`;
  }

  if (relativePath.startsWith("src/pages/merchant-admin/")) {
    return `商户后台 / ${humanizeIdentifier(baseName)}`;
  }

  if (relativePath.startsWith("src/pages/admin/")) {
    return `平台后台 / ${humanizeIdentifier(baseName)}`;
  }

  if (relativePath.startsWith("src/features/settings/")) {
    return `统一设置页 / ${humanizeIdentifier(baseName)}`;
  }

  return `${getFeatureSheetTitle(inferFeatureKey(filePath))} / ${humanizeIdentifier(baseName)}`;
}

function getPropertyNameText(name) {
  if (!name) {
    return null;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return name.getText();
}

function getJsxTagNameText(tagName) {
  return tagName.getText().replace(/\s+/gu, " ");
}

function getNearestJsxElementName(node) {
  let current = node.parent;

  while (current) {
    if (ts.isJsxElement(current)) {
      return getJsxTagNameText(current.openingElement.tagName);
    }

    if (ts.isJsxSelfClosingElement(current)) {
      return getJsxTagNameText(current.tagName);
    }

    current = current.parent;
  }

  return null;
}

function getNearestOwnerName(node) {
  let current = node.parent;

  while (current) {
    if ((ts.isFunctionDeclaration(current) || ts.isClassDeclaration(current) || ts.isMethodDeclaration(current)) && current.name) {
      return current.name.getText();
    }

    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }

    if (ts.isPropertyAssignment(current)) {
      const propertyName = getPropertyNameText(current.name);

      if (propertyName) {
        return propertyName;
      }
    }

    current = current.parent;
  }

  return null;
}

function describeNodeRole(node) {
  if (ts.isJsxText(node)) {
    const elementName = getNearestJsxElementName(node);
    return elementName ? `${elementName} 文本` : "页面文本";
  }

  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ts.isJsxAttribute(node.parent)) {
    const elementName = getNearestJsxElementName(node.parent);
    return `${elementName ? `${elementName} ` : ""}${node.parent.name.getText()} 属性`;
  }

  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ts.isPropertyAssignment(node.parent)) {
    const propertyName = getPropertyNameText(node.parent.name);
    return propertyName ? `${propertyName} 配置` : "配置文案";
  }

  return "文案";
}

function buildUsageExample(sourceFile, node) {
  const filePath = sourceFile.fileName;
  const line = getLineOfPosition(sourceFile, node.getStart(sourceFile));
  const relativePath = toWorkspaceRelativePath(filePath);
  const usageLabel = resolveFileUsageLabel(filePath);
  const owner = getNearestOwnerName(node);
  const role = describeNodeRole(node);
  const context = [usageLabel, owner, role].filter(Boolean).join(" / ");

  return {
    file: relativePath,
    line,
    label: `${context}（${relativePath}:${line}）`
  };
}

async function readCodeFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const targetPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await readCodeFiles(targetPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!codeFileExtensions.has(path.extname(targetPath))) {
      continue;
    }

    if (isExcludedFile(targetPath)) {
      continue;
    }

    files.push(targetPath);
  }

  return files.sort();
}

async function loadTranslationsModule() {
  const source = await fs.readFile(sourceFile, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(tempModuleFile, transpiled, "utf8");
  const moduleUrl = `${pathToFileURL(tempModuleFile).href}?t=${Date.now()}`;
  return import(moduleUrl);
}

function addOccurrence(map, text, usage) {
  const featureKey = inferFeatureKey(path.join(workspaceRoot, usage.file));
  const existing = map.get(text);

  if (existing) {
    existing.count += 1;
    existing.featureCounts.set(featureKey, (existing.featureCounts.get(featureKey) ?? 0) + 1);

    if (existing.examples.length < usageExampleLimit && !existing.examples.some((item) => item.file === usage.file && item.line === usage.line)) {
      existing.examples.push(usage);
    }

    return;
  }

  map.set(text, {
    count: 1,
    featureCounts: new Map([[featureKey, 1]]),
    examples: [usage]
  });
}

function collectTextOccurrences(sourceFile, output) {
  function visit(node) {
    if (ts.isJsxText(node)) {
      const value = normalizeText(node.getText(sourceFile));
      const kind = classifySourceText(value);

      if (kind === "zh_source") {
        addOccurrence(output, value, buildUsageExample(sourceFile, node));
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = normalizeText(node.text);
      const kind = classifySourceText(value);

      if (kind === "zh_source") {
        addOccurrence(output, value, buildUsageExample(sourceFile, node));
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function getScriptKind(filePath) {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

async function buildOccurrenceIndex() {
  const files = (await Promise.all(sourceDirectories.map((directory) => readCodeFiles(directory)))).flat().sort();
  const occurrences = new Map();

  for (const filePath of files) {
    const sourceText = await fs.readFile(filePath, "utf8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, getScriptKind(filePath));
    collectTextOccurrences(source, occurrences);
  }

  return occurrences;
}

function resolveFeatureKey(sourceText, occurrenceIndex) {
  const occurrence = occurrenceIndex.get(sourceText);

  if (!occurrence || occurrence.featureCounts.size === 0) {
    return "common";
  }

  const ranked = [...occurrence.featureCounts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return compareFeatureKeys(left[0], right[0]);
  });

  return ranked[0][0];
}

function buildUsageDescription(sourceText, occurrenceIndex) {
  const occurrence = occurrenceIndex.get(sourceText);

  if (!occurrence || occurrence.examples.length === 0) {
    return "未在当前源码扫描中找到使用位置，可能只存在于词表或动态数据。";
  }

  const examples = occurrence.examples.map((item) => item.label);
  const moreCount = Math.max(0, occurrence.count - occurrence.examples.length);

  if (moreCount === 0) {
    return examples.join("\n");
  }

  return `${examples.join("\n")}\n另有 ${moreCount} 处同文案使用。`;
}

function estimateDisplayByteLimit(sourceText, usageDescription) {
  const text = normalizeText(sourceText);
  const usage = normalizeText(usageDescription);
  const charCount = Array.from(text).length;
  const textBytes = Buffer.byteLength(text, "utf8");
  const isSentence = /[。！？!?；;]/u.test(text) || charCount >= 24;
  const isVeryLong = charCount >= 120 || textBytes >= 360;
  const isLong = charCount >= 64 || textBytes >= 192;

  if (/按钮|button|Button|标签|Badge|tab|Tab|菜单|Menu|筛选|Filter|状态|Status|操作|Action/u.test(usage)) {
    if (charCount <= 4) {
      return 24;
    }

    if (charCount <= 8) {
      return 36;
    }

    return 48;
  }

  if (/标题|Title|Header|h1|h2|h3|导航|Nav|列名|字段|Field/u.test(usage)) {
    if (charCount <= 8) {
      return 48;
    }

    return 72;
  }

  if (/placeholder|占位|输入|搜索|Input|Search/u.test(usage)) {
    return 72;
  }

  if (/说明|描述|提示|caption|description|helper|info|Tooltip|属性|配置/u.test(usage)) {
    if (isLong) {
      return 360;
    }

    return 180;
  }

  if (/通知|公告|更新|日志|记录|详情|简介|评论|评价|消息|对话|内容|文案/u.test(usage) || isSentence) {
    if (isVeryLong) {
      return 900;
    }

    if (isLong) {
      return 600;
    }

    return 240;
  }

  if (charCount <= 4) {
    return 24;
  }

  if (charCount <= 10) {
    return 48;
  }

  return 96;
}

function buildSheetRows(translations, occurrenceIndex) {
  const grouped = new Map();
  const sourceTexts = Array.from(new Set([...Object.keys(translations).filter((sourceText) => shouldKeepExistingTranslationKey(sourceText)), ...occurrenceIndex.keys()]))
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));

  for (const sourceText of sourceTexts) {
    const values = translations[sourceText] ?? {};
    const featureKey = resolveFeatureKey(sourceText, occurrenceIndex);
    const usageDescription = buildUsageDescription(sourceText, occurrenceIndex);
    const row = [
      sourceText,
      normalizeWorkbookTranslationCell(values["zh-Hant"], sourceText),
      normalizeWorkbookTranslationCell(values.ja),
      normalizeWorkbookTranslationCell(values.en),
      normalizeWorkbookTranslationCell(values.ko),
      usageDescription,
      estimateDisplayByteLimit(sourceText, usageDescription),
      ""
    ];

    grouped.set(featureKey, [...(grouped.get(featureKey) ?? []), row]);
  }

  return grouped;
}

async function buildWorkbook(groupedRows) {
  const workbook = Workbook.create();
  const createdSheets = [];
  const usageColumn = getExcelColumnName(5);
  const displayByteLimitColumn = getExcelColumnName(6);
  const manualEditColumn = getExcelColumnName(7);
  const lastColumn = getExcelColumnName(workbookHeaders.length - 1);

  for (const feature of workbookFeatureSheets) {
    const rows = groupedRows.get(feature.key) ?? [];

    if (rows.length === 0) {
      continue;
    }

    const sheet = workbook.worksheets.add(getFeatureSheetTitle(feature.key));
    sheet.getRangeByIndexes(0, 0, 1, workbookHeaders.length).values = [workbookHeaders];
    sheet.getRangeByIndexes(1, 0, rows.length, workbookHeaders.length).values = rows;
    sheet.getRange(`A1:${lastColumn}1`).format = {
      fill: "#1D4ED8",
      font: { bold: true, color: "#FFFFFF" },
      horizontalAlignment: "center",
      verticalAlignment: "center"
    };
    sheet.getRange(`A2:${lastColumn}${rows.length + 1}`).format.wrapText = true;
    sheet.getRange(`A1:${lastColumn}${rows.length + 1}`).format.autofitColumns();
    sheet.getRange(`A1:A${rows.length + 1}`).format.columnWidthPx = 320;
    sheet.getRange(`B1:E${rows.length + 1}`).format.columnWidthPx = 280;
    sheet.getRange(`${usageColumn}1:${usageColumn}${rows.length + 1}`).format.columnWidthPx = 560;
    sheet.getRange(`${displayByteLimitColumn}1:${displayByteLimitColumn}${rows.length + 1}`).format.columnWidthPx = 150;
    sheet.getRange(`${displayByteLimitColumn}2:${displayByteLimitColumn}${rows.length + 1}`).format.horizontalAlignment = "center";
    sheet.getRange(`${manualEditColumn}1:${manualEditColumn}${rows.length + 1}`).format.columnWidthPx = 150;
    sheet.getRange(`${manualEditColumn}2:${manualEditColumn}${rows.length + 1}`).format.horizontalAlignment = "center";

    for (const [rowIndex, row] of rows.entries()) {
      if (manuallyReviewedJapaneseSourceTexts.has(row[0])) {
        sheet.getRangeByIndexes(rowIndex + 1, 2, 1, 1).format.fill = "#FDE68A";
      }
    }

    sheet.freezePanes.freezeRows(1);
    sheet.showGridLines = false;

    createdSheets.push({
      key: feature.key,
      title: getFeatureSheetTitle(feature.key),
      rowCount: rows.length
    });
  }

  return { workbook, createdSheets };
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
  const { translations } = await loadTranslationsModule();
  const occurrenceIndex = await buildOccurrenceIndex();
  const groupedRows = buildSheetRows(translations, occurrenceIndex);
  const { workbook, createdSheets } = await buildWorkbook(groupedRows);
  const totalRowCount = createdSheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(workbookFile);

  console.log(
    JSON.stringify(
      {
        workbookFile,
        sheetCount: createdSheets.length,
        rowCount: totalRowCount,
        existingTranslationCount: Object.keys(translations).length,
        sheets: createdSheets
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await fs.unlink(tempModuleFile);
    } catch {
      // Ignore temp cleanup failures.
    }
  });
