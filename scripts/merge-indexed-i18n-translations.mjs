import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const workspaceRoot = "/Users/eason/Documents/New project";
const sourceFile = path.join(workspaceRoot, "src", "i18n", "translations.ts");

async function loadTranslationsFromSource(sourceCode) {
  const tempFile = path.join("/private/tmp", `needo-indexed-i18n-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  const transpiled = ts.transpileModule(sourceCode, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  await fs.writeFile(tempFile, transpiled, "utf8");

  try {
    const loaded = await import(`file://${tempFile}`);
    return loaded.translations ?? {};
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

function buildTranslationBlock(entries) {
  const lines = Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"))
    .map(([sourceText, entry]) => {
      const parts = [];

      if (entry["zh-Hant"] && entry["zh-Hant"] !== sourceText) {
        parts.push(`${JSON.stringify("zh-Hant")}: ${JSON.stringify(entry["zh-Hant"])}`);
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

      return `  ${JSON.stringify(sourceText)}: { ${parts.join(", ")} },`;
    });

  return `export const translations: TranslationMap = {\n${lines.join("\n")}\n};`;
}

async function main() {
  const currentSource = await fs.readFile(sourceFile, "utf8");
  const indexedSource = execFileSync("git", ["show", ":src/i18n/translations.ts"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  const currentTranslations = await loadTranslationsFromSource(currentSource);
  const indexedTranslations = await loadTranslationsFromSource(indexedSource);
  const mergedTranslations = {
    ...indexedTranslations,
    ...currentTranslations
  };
  const block = buildTranslationBlock(mergedTranslations);
  const translationsBlockPattern =
    /export const translations: TranslationMap = \{[\s\S]*?\n\};\n\nexport function getTranslationLookupCandidates/u;

  if (!translationsBlockPattern.test(currentSource)) {
    throw new Error("未能替换 src/i18n/translations.ts 中的 translations 区块。");
  }

  const updated = currentSource.replace(translationsBlockPattern, () => `${block}\n\nexport function getTranslationLookupCandidates`);

  await fs.writeFile(sourceFile, updated, "utf8");

  console.log(
    JSON.stringify(
      {
        currentCount: Object.keys(currentTranslations).length,
        indexedCount: Object.keys(indexedTranslations).length,
        mergedCount: Object.keys(mergedTranslations).length,
        recoveredCount: Object.keys(mergedTranslations).length - Object.keys(currentTranslations).length
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
