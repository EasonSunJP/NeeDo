import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { workbookFeatureSheets, workbookLanguageHeaders } from "./i18n-workbook-config.mjs";

const workspaceRoot = "/Users/eason/Documents/New project";
const sourceFile = path.join(workspaceRoot, "src", "i18n", "translations.ts");
const importableSheetNames = new Set(workbookFeatureSheets.map((sheet) => sheet.title));
const approvedTranslationOverrides = new Map([
  ["语言", { en: "language" }],
  ["技师", { ja: "スタッフ", en: "Technician", ko: "기사" }],
  ["员工", { ja: "スタッフ", en: "Staff", ko: "스태프" }],
  ["个人事业者/员工", { "zh-Hant": "技師", ja: "スタッフ", en: "Technician", ko: "기사" }],
  ["员工列表", { ja: "スタッフリスト", en: "Staff List", ko: "스태프 목록" }],
  ["店铺员工信息卡", { en: "Store Staff Info Card" }],
  ["与平台运营后台共用同一套员工列表模块，商户侧只展示当前商户可管理的员工数据。", { ja: "プラットフォーム運営管理画面と同じスタッフリストモジュールを共有し、事業者側では現在の事業者が管理できるスタッフデータのみを表示します。" }],
  ["当前周期确认", { en: "Current Cycle Confirmation" }],
  ["现状确认", { ja: "現状確認", en: "Current Status", ko: "현황 확인" }],
  ["日视图", { ja: "単日表示", en: "Single-Day View", ko: "단일 날짜 표시" }],
  ["周视图", { ja: "週間表示", en: "Weekly View", ko: "주간 표시" }],
  ["月视图", { ja: "月間表示", en: "Monthly View", ko: "월간 표시" }],
  ["调度中心 / 排班一览", { ja: "管理センター／シフト一覧", en: "Management Center / Shift Overview", ko: "관리 센터 / 근무표 개요" }],
  ["保存到共享排班", { ja: "共有シフトに保存", en: "Save to shared shift", ko: "공유 근무표에 저장" }],
  ["5 个安排", { ja: "5 件の予定" }],
  ["5 个冲突", { en: "5 conflicts" }],
  ["手动修改班次", { ja: "シフトを手動編集" }],
  ["取消班次", { en: "Cancel shift" }],
  ["可排班 / 可预约", { en: "Shift available / Bookable" }],
  ["添加行程", { "zh-Hant": "新增行程", ja: "予定追加", en: "Add schedule", ko: "일정 추가" }],
  ["仅行程", { ja: "予定のみ", en: "Schedule only", ko: "일정만" }],
  ["全时间", { ja: "全時間", en: "All times", ko: "전체 시간" }],
  ["开放中", { ko: "개방 중" }],
  ["周期", { ja: "周期" }],
  ["循环", { ja: "周期" }],
  ["冲突", { ja: "重複" }],
  ["出勤", { ja: "出勤", en: "On duty", ko: "출근" }],
  ["移动中", { ja: "移動中", en: "In transit", ko: "이동 중" }],
  ["服务中", { ja: "サービス中", en: "In service", ko: "서비스 중" }],
  ["退勤", { ja: "退勤", en: "Off duty", ko: "퇴근" }],
  ["利用政策", { ja: "利用規約", en: "Terms of Use" }],
  ["隐私政策", { ja: "個人情報保護方針", ko: "개인정보 처리방침" }],
  ["注销账号", { ja: "退会" }],
  ["数据", { ja: "データ", en: "Data", ko: "데이터" }],
  ["情报", { ja: "情報", en: "Info", ko: "정보" }],
  ["个人情报", { ja: "情報", en: "Info", ko: "정보" }],
  ["店铺情报", { ja: "情報", en: "Info", ko: "정보" }],
  ["需求", { ja: "需要", en: "Need", ko: "필요" }],
  ["发送需求", { ja: "需要を送信", en: "Send Need", ko: "필요 보내기" }],
  ["需求详情", { ja: "需要の詳細", en: "Need details", ko: "필요 상세" }],
  ["活力黑白版", { ja: "活躍白黒", en: "Active Black & White", ko: "활력 블랙화이트" }],
  ["冷酷黑灰版", { ja: "クールダーク", en: "Cool Dark", ko: "쿨 다크" }],
  ["白绿版", { ja: "白緑", en: "White Green", ko: "화이트 그린" }],
  ["黑绿版", { ja: "黒緑", en: "Black Green", ko: "블랙 그린" }],
  ["霓虹粉紫版", { ja: "ピンク紫", en: "Pink Purple", ko: "핑크 퍼플" }],
  ["黑金版", { ja: "黒ゴールド", en: "Black Gold", ko: "블랙 골드" }],
  ["三端统一切换活力黑白 / 冷酷黑灰 / 白绿 / 黑绿 / 霓虹粉紫 / 黑金主题，由同一套 token 与组件承载。", { ja: "三端で活躍白黒／クールダーク／白緑／黒緑／ピンク紫／黒ゴールドテーマを統一切替し、同じ token とコンポーネントで支えます。" }],
  ["人评价", { ja: "人の評価", en: "reviews", ko: "명 평가" }],
  ["信用度", { "zh-Hant": "信用值", ja: "信用度", en: "Credit level", ko: "신용도" }],
  ["集中查看店铺工作的趋势、结算和下一单安排。", { en: "View store-work trends, settlement, and the next assignment in one place." }],
  ["仅展示店铺工作的统计卡片，便于核对门店收入、排班和履约表现。", { ja: "店舗業務の統計カードのみを表示し、店舗収入、シフト、履行状況を確認しやすくします。" }],
  ["最近的店铺工作会归档在这里，方便核对排班和收入记录。", { ko: "최근 매장 업무는 여기에 보관되어 근무표와 수입 기록을 쉽게 확인할 수 있습니다." }]
]);

function normalizeCell(value) {
  const normalized = normalizeSpreadsheetValue(String(value ?? "").replace(/\r\n/g, "\n").trim());

  return normalized ?? "";
}

function normalizeJapaneseCell(value) {
  return normalizeCell(value)
    .replace(/個人事業者/gu, "スタッフ")
    .replace(/スタッフ\/スタッフ/gu, "スタッフ")
    .replace(/(?<!リ)サイクル/gu, "周期")
    .replace(/競合/gu, "重複");
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

function normalizeSpreadsheetValue(value) {
  if (!value || isSpreadsheetErrorValue(value)) {
    return "";
  }

  const extracted = extractIfErrorFallback(value);
  const normalized = String(extracted ?? value).trim();

  if (!normalized || isSpreadsheetErrorValue(normalized) || looksLikeSpreadsheetFormula(normalized) || normalized.includes("__xludf.DUMMYFUNCTION")) {
    return "";
  }

  return normalized;
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

function assertHeaders(actualRow, sheetName) {
  const actualHeaders = actualRow.slice(0, workbookLanguageHeaders.length).map((value) => normalizeCell(value));

  if (actualHeaders.length !== workbookLanguageHeaders.length || actualHeaders.some((value, index) => value !== workbookLanguageHeaders[index])) {
    throw new Error(`${sheetName} 表头不匹配，前 ${workbookLanguageHeaders.length} 列必须严格为：${workbookLanguageHeaders.join(" / ")}`);
  }
}

function extractSheetEntries(rows, sheetName) {
  const seen = new Set();
  const duplicates = [];
  const entries = [];

  for (const row of rows.slice(1)) {
    const zh = normalizeCell(row[0]);

    if (!zh) {
      continue;
    }

    if (seen.has(zh)) {
      duplicates.push(zh);
      continue;
    }

    seen.add(zh);
    const entry = {
      sheetName,
      zh,
      "zh-Hant": normalizeCell(row[1]),
      ja: normalizeJapaneseCell(row[2]),
      en: normalizeCell(row[3]),
      ko: normalizeCell(row[4])
    };
    const override = approvedTranslationOverrides.get(zh);

    entries.push(override ? { ...entry, ...override } : entry);
  }

  return { entries, duplicates };
}

function buildTranslationBlock(entries) {
  const lines = entries
    .sort((left, right) => left.zh.localeCompare(right.zh, "zh-Hans-CN"))
    .map((entry) => {
      const parts = [];

      if (entry["zh-Hant"] && entry["zh-Hant"] !== entry.zh) {
        parts.push(`"zh-Hant": ${JSON.stringify(entry["zh-Hant"])}`);
      }

      if (entry.ja) {
        parts.push(`ja: ${JSON.stringify(entry.ja)}`);
      }

      if (entry.en) {
        parts.push(`en: ${JSON.stringify(entry.en)}`);
      }

      if (entry.ko) {
        parts.push(`ko: ${JSON.stringify(entry.ko)}`);
      }

      return `  ${JSON.stringify(entry.zh)}: { ${parts.join(", ")} },`;
    });

  return `export const translations: TranslationMap = {\n${lines.join("\n")}\n};`;
}

async function loadWorkbookEntries(workbookPath) {
  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const entries = [];
  const duplicates = [];
  const processedSheets = [];
  const skippedSheets = [];

  for (const sheet of workbook.worksheets.items) {
    if (!importableSheetNames.has(sheet.name)) {
      skippedSheets.push(sheet.name);
      continue;
    }

    const usedRange = sheet.getUsedRange(true);
    const rows = usedRange?.values ?? [];

    if (rows.length === 0 || rows.every((row) => row.every((cell) => normalizeCell(cell) === ""))) {
      continue;
    }

    assertHeaders(rows[0] ?? [], sheet.name);
    const result = extractSheetEntries(rows, sheet.name);

    if (result.duplicates.length > 0) {
      duplicates.push(...result.duplicates.map((item) => `${sheet.name}: ${item}`));
    }

    entries.push(...result.entries);
    processedSheets.push({ name: sheet.name, rowCount: result.entries.length });
  }

  return { entries, duplicates, processedSheets, skippedSheets };
}

async function main() {
  const workbookPath = process.argv[2];

  if (!workbookPath) {
    throw new Error("用法：node scripts/import-i18n-workbook.mjs <workbook-path>");
  }

  const workbook = await loadWorkbookEntries(workbookPath);

  if (workbook.processedSheets.length === 0) {
    throw new Error("工作簿里没有可导入的功能插页。");
  }

  if (workbook.duplicates.length > 0) {
    throw new Error(`发现重复的简体中文主键：${workbook.duplicates.slice(0, 10).join(" / ")}`);
  }

  const globalSeen = new Set();
  const crossSheetDuplicates = [];

  for (const entry of workbook.entries) {
    if (globalSeen.has(entry.zh)) {
      crossSheetDuplicates.push(entry.zh);
      continue;
    }

    globalSeen.add(entry.zh);
  }

  if (crossSheetDuplicates.length > 0) {
    throw new Error(`不同插页之间存在重复的简体中文主键：${crossSheetDuplicates.slice(0, 10).join(" / ")}`);
  }

  const block = buildTranslationBlock(workbook.entries);
  const source = await fs.readFile(sourceFile, "utf8");
  const updated = source.replace(
    /export const translations: TranslationMap = \{[\s\S]*?\n\};\n\nexport function getTranslationLookupCandidates/u,
    `${block}\n\nexport function getTranslationLookupCandidates`
  );

  if (updated === source) {
    throw new Error("未能替换 src/i18n/translations.ts 中的 translations 区块。");
  }

  await fs.writeFile(sourceFile, updated, "utf8");

  console.log(
    JSON.stringify(
      {
        workbookPath,
        sheetCount: workbook.processedSheets.length,
        translationCount: workbook.entries.length,
        sheets: workbook.processedSheets,
        skippedSheets: workbook.skippedSheets
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
