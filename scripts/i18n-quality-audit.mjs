import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const workspaceRoot = "/Users/eason/Documents/New project";
const translationsPath = path.join(workspaceRoot, "src", "i18n", "translations.ts");
const outputDir = path.join(workspaceRoot, "exports", "i18n");
const jsonReportPath = path.join(outputDir, "i18n-quality-report.json");
const markdownReportPath = path.join(outputDir, "i18n-quality-report.md");
const targetLanguages = ["zh-Hant", "ja", "en", "ko"];
const spreadsheetErrors = new Set(["#NAME?", "#VALUE!", "#REF!", "#DIV/0!", "#N/A", "#NUM!", "#NULL!", "#SPILL!", "#CALC!"]);
const simplifiedLeakPattern = /[这们来个为国广后时发会汉语车选项页户师须级态数据额场证联络门闭显击库导标栏图过进违单审储欢权业]/u;
const cjkPattern = /[\u3400-\u9fff\uf900-\ufaff]/u;
const kanaPattern = /[\u3040-\u30ff]/u;
const hangulPattern = /[\uac00-\ud7af]/u;

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function hasSpreadsheetError(value) {
  const normalized = normalizeText(value).toUpperCase();
  return spreadsheetErrors.has(normalized) || normalized.startsWith("=") || normalized.includes("__XLUDF.DUMMYFUNCTION");
}

function looksLikeProperJapaneseOrName(sourceText, value) {
  const text = normalizeText(value || sourceText);

  if (text.length > 16) {
    return false;
  }

  return /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9\s・ー（）()]+$/u.test(text);
}

function addIssue(list, issue) {
  if (list.length < 200) {
    list.push(issue);
  }
}

function analyzeTranslations(translations) {
  const summary = {
    entryCount: Object.keys(translations).length,
    missingByLanguage: Object.fromEntries(targetLanguages.map((language) => [language, 0])),
    spreadsheetErrorCount: 0,
    englishCjkLeakCount: 0,
    koreanMixedLeakCount: 0,
    japaneseSimplifiedLeakCount: 0,
    traditionalSimplifiedLeakCount: 0,
    sameAsSourceCount: 0
  };
  const issues = {
    missing: [],
    spreadsheetErrors: [],
    englishCjkLeaks: [],
    koreanMixedLeaks: [],
    japaneseSimplifiedLeaks: [],
    traditionalSimplifiedLeaks: [],
    sameAsSource: []
  };

  for (const [sourceText, entry] of Object.entries(translations)) {
    for (const language of targetLanguages) {
      const value = normalizeText(entry[language]);

      if (!value) {
        summary.missingByLanguage[language] += 1;
        addIssue(issues.missing, { sourceText, language });
        continue;
      }

      if (hasSpreadsheetError(value)) {
        summary.spreadsheetErrorCount += 1;
        addIssue(issues.spreadsheetErrors, { sourceText, language, value });
      }

      if (language === "en" && cjkPattern.test(value) && !looksLikeProperJapaneseOrName(sourceText, value)) {
        summary.englishCjkLeakCount += 1;
        addIssue(issues.englishCjkLeaks, { sourceText, value });
      }

      if (language === "ko" && (cjkPattern.test(value) || kanaPattern.test(value)) && !looksLikeProperJapaneseOrName(sourceText, value)) {
        summary.koreanMixedLeakCount += 1;
        addIssue(issues.koreanMixedLeaks, { sourceText, value });
      }

      if (language === "ja" && simplifiedLeakPattern.test(value) && !looksLikeProperJapaneseOrName(sourceText, value)) {
        summary.japaneseSimplifiedLeakCount += 1;
        addIssue(issues.japaneseSimplifiedLeaks, { sourceText, value });
      }

      if (language === "zh-Hant" && simplifiedLeakPattern.test(value)) {
        summary.traditionalSimplifiedLeakCount += 1;
        addIssue(issues.traditionalSimplifiedLeaks, { sourceText, value });
      }

      if (language !== "zh-Hant" && value === sourceText && cjkPattern.test(sourceText) && sourceText.length > 1 && !looksLikeProperJapaneseOrName(sourceText, value)) {
        summary.sameAsSourceCount += 1;
        addIssue(issues.sameAsSource, { sourceText, language });
      }
    }
  }

  return { summary, issues };
}

async function loadTranslations() {
  const source = await fs.readFile(translationsPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const tempFile = path.join(outputDir, `translations-quality-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(tempFile, transpiled, "utf8");

  try {
    const loaded = await import(`file://${tempFile}`);
    return loaded.translations ?? {};
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

function renderIssueList(title, items, formatter) {
  if (items.length === 0) {
    return `### ${title}\n\nなし。\n`;
  }

  return `### ${title}\n\n${items.slice(0, 30).map(formatter).join("\n")}\n`;
}

function renderMarkdown(report) {
  const { summary, issues } = report;
  const missingSummary = Object.entries(summary.missingByLanguage)
    .map(([language, count]) => `${language}: ${count}`)
    .join(" / ");

  return `# i18n quality report

Generated from \`src/i18n/translations.ts\`.

## Summary

- Entries: ${summary.entryCount}
- Missing cells: ${missingSummary}
- Spreadsheet/formula errors: ${summary.spreadsheetErrorCount}
- English CJK leaks: ${summary.englishCjkLeakCount}
- Korean mixed-language leaks: ${summary.koreanMixedLeakCount}
- Japanese simplified-character leaks: ${summary.japaneseSimplifiedLeakCount}
- Traditional Chinese simplified-character leaks: ${summary.traditionalSimplifiedLeakCount}
- Non-Traditional translations same as source: ${summary.sameAsSourceCount}

${renderIssueList("Spreadsheet/formula errors", issues.spreadsheetErrors, (item) => `- ${item.language}: ${item.sourceText} -> ${item.value}`)}
${renderIssueList("English CJK leaks", issues.englishCjkLeaks, (item) => `- ${item.sourceText} -> ${item.value}`)}
${renderIssueList("Korean mixed-language leaks", issues.koreanMixedLeaks, (item) => `- ${item.sourceText} -> ${item.value}`)}
${renderIssueList("Japanese simplified-character leaks", issues.japaneseSimplifiedLeaks, (item) => `- ${item.sourceText} -> ${item.value}`)}
${renderIssueList("Traditional Chinese simplified-character leaks", issues.traditionalSimplifiedLeaks, (item) => `- ${item.sourceText} -> ${item.value}`)}
`;
}

async function main() {
  const translations = await loadTranslations();
  const report = {
    generatedAt: new Date().toISOString(),
    ...analyzeTranslations(translations)
  };

  await fs.writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownReportPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({ jsonReportPath, markdownReportPath, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

