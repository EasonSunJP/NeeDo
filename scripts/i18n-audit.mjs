import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const translationsPath = path.join(workspaceRoot, "src/i18n/translations.ts");
const identityTranslationsPath = path.join(
  workspaceRoot,
  "src/features/identity-applications/i18n.ts",
);
const affiliateProfileTranslationsPath = path.join(
  workspaceRoot,
  "src/features/affiliate-profile/i18n.ts",
);
const affiliateMarketplaceTranslationsPath = path.join(
  workspaceRoot,
  "src/features/affiliate-marketplace/i18n.ts",
);
const dashboardTranslationsPath = path.join(
  workspaceRoot,
  "src/features/dashboard/dashboardTranslations.ts",
);
const orderPerformanceTranslationsPath = path.join(
  workspaceRoot,
  "src/features/order-performance/i18n.ts",
);
const platformUserManagementTranslationsPath = path.join(
  workspaceRoot,
  "src/features/platform-user-management/i18n.ts",
);
const sourceDirectories = [
  path.join(workspaceRoot, "src"),
  path.join(workspaceRoot, "scripts"),
];

const codeFileExtensions = new Set([".ts", ".tsx", ".mjs"]);
const excludedFilePatterns = [
  /src\/i18n\/translations\.ts$/u,
  /src\/features\/dashboard\/dashboardTranslations\.ts$/u,
  /src\/features\/platform-user-management\/i18n\.ts$/u,
];

function normalizeText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function isExcludedFile(filePath) {
  return excludedFilePatterns.some((pattern) => pattern.test(filePath));
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

function looksLikeUiText(value) {
  const text = normalizeText(value);

  if (!text) {
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
    /^([A-Za-z0-9_-]+\.)+[A-Za-z0-9_-]+$/u.test(text) ||
    /^#[0-9A-Fa-f]{3,8}$/u.test(text)
  ) {
    return false;
  }

  return true;
}

function classifySourceText(value) {
  const text = normalizeText(value);
  if (!looksLikeUiText(text)) {
    return "ignore";
  }

  return containsKana(text) || containsHangul(text)
    ? "non_zh_source"
    : "zh_source";
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

let identityTranslationsPromise;
let affiliateProfileTranslationsPromise;
let affiliateMarketplaceTranslationsPromise;
let dashboardTranslationsPromise;
let orderPerformanceTranslationsPromise;
let platformUserManagementTranslationsPromise;

async function loadIdentityTranslations() {
  identityTranslationsPromise ??= (async () => {
    const source = await fs.readFile(identityTranslationsPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const encoded = Buffer.from(transpiled, "utf8").toString("base64");
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.identityApplicationTranslations ?? {};
  })();

  return identityTranslationsPromise;
}

async function loadAffiliateProfileTranslations() {
  affiliateProfileTranslationsPromise ??= (async () => {
    const source = await fs.readFile(affiliateProfileTranslationsPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const encoded = Buffer.from(transpiled, "utf8").toString("base64");
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.affiliateProfileTranslations ?? {};
  })();

  return affiliateProfileTranslationsPromise;
}

async function loadAffiliateMarketplaceTranslations() {
  affiliateMarketplaceTranslationsPromise ??= (async () => {
    const source = await fs.readFile(
      affiliateMarketplaceTranslationsPath,
      "utf8",
    );
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const encoded = Buffer.from(transpiled, "utf8").toString("base64");
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.affiliateMarketplaceTranslations ?? {};
  })();

  return affiliateMarketplaceTranslationsPromise;
}

async function loadDashboardTranslations() {
  dashboardTranslationsPromise ??= (async () => {
    const source = await fs.readFile(dashboardTranslationsPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const encoded = Buffer.from(transpiled, "utf8").toString("base64");
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.dashboardTranslations ?? {};
  })();

  return dashboardTranslationsPromise;
}

async function loadOrderPerformanceTranslations() {
  orderPerformanceTranslationsPromise ??= (async () => {
    const source = await fs.readFile(orderPerformanceTranslationsPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const encoded = Buffer.from(transpiled, "utf8").toString("base64");
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.orderPerformanceTranslations ?? {};
  })();

  return orderPerformanceTranslationsPromise;
}

async function loadPlatformUserManagementTranslations() {
  platformUserManagementTranslationsPromise ??= (async () => {
    const source = await fs.readFile(platformUserManagementTranslationsPath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const encoded = Buffer.from(transpiled, "utf8").toString("base64");
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.platformUserManagementTranslations ?? {};
  })();

  return platformUserManagementTranslationsPromise;
}

async function loadTranslationsFromSource(sourceCode) {
  const identityTranslations = await loadIdentityTranslations();
  const affiliateProfileTranslations = await loadAffiliateProfileTranslations();
  const affiliateMarketplaceTranslations =
    await loadAffiliateMarketplaceTranslations();
  const dashboardTranslations = await loadDashboardTranslations();
  const orderPerformanceTranslations = await loadOrderPerformanceTranslations();
  const platformUserManagementTranslations = await loadPlatformUserManagementTranslations();
  const standaloneSource = sourceCode.replace(
    /import\s+\{\s*identityApplicationTranslations\s*\}\s+from\s+["'][^"']+["'];?/u,
    `const identityApplicationTranslations = ${JSON.stringify(identityTranslations)};`,
  ).replace(
    /import\s+\{\s*affiliateProfileTranslations\s*\}\s+from\s+["'][^"']+["'];?/u,
    `const affiliateProfileTranslations = ${JSON.stringify(affiliateProfileTranslations)};`,
  ).replace(
    /import\s+\{\s*affiliateMarketplaceTranslations\s*\}\s+from\s+["'][^"']+["'];?/u,
    `const affiliateMarketplaceTranslations = ${JSON.stringify(affiliateMarketplaceTranslations)};`,
  ).replace(
    /import\s+\{\s*dashboardTranslations\s*\}\s+from\s+["'][^"']+["'];?/u,
    `const dashboardTranslations = ${JSON.stringify(dashboardTranslations)};`,
  ).replace(
    /import\s+\{\s*orderPerformanceTranslations\s*\}\s+from\s+["'][^"']+["'];?/u,
    `const orderPerformanceTranslations = ${JSON.stringify(orderPerformanceTranslations)};`,
  ).replace(
    /import\s+\{\s*platformUserManagementTranslations\s*\}\s+from\s+["'][^"']+["'];?/u,
    `const platformUserManagementTranslations = ${JSON.stringify(platformUserManagementTranslations)};`,
  );
  const tempFile = path.join(
    workspaceRoot,
    "exports",
    "i18n",
    `translations-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  const transpiled = ts.transpileModule(standaloneSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  await fs.mkdir(path.dirname(tempFile), { recursive: true });
  await fs.writeFile(tempFile, transpiled, "utf8");

  try {
    const loaded = await import(`file://${tempFile}`);
    return {
      ...platformUserManagementTranslations,
      ...(loaded.translations ?? {}),
    };
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

async function loadCurrentTranslations() {
  const source = await fs.readFile(translationsPath, "utf8");
  return loadTranslationsFromSource(source);
}

async function loadIndexedTranslations() {
  const source = execFileSync("git", ["show", ":src/i18n/translations.ts"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return loadTranslationsFromSource(source);
}

function addOccurrence(map, text, filePath, line) {
  const existing = map.get(text);

  if (existing) {
    existing.count += 1;
    if (
      existing.examples.length < 5 &&
      !existing.examples.some(
        (item) => item.file === filePath && item.line === line,
      )
    ) {
      existing.examples.push({ file: filePath, line });
    }
    return;
  }

  map.set(text, {
    text,
    count: 1,
    examples: [{ file: filePath, line }],
  });
}

function lineOfPosition(source, position) {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function collectUiStrings(sourceFile, sourceText, output) {
  function visit(node) {
    if (ts.isJsxText(node)) {
      const value = normalizeText(node.getText(sourceFile));
      const kind = classifySourceText(value);

      if (kind !== "ignore") {
        addOccurrence(
          kind === "zh_source" ? output.zhSource : output.nonZhSource,
          value,
          sourceFile.fileName,
          lineOfPosition(sourceFile, node.getStart(sourceFile)),
        );
      }
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const value = normalizeText(node.text);
      const kind = classifySourceText(value);

      if (kind !== "ignore") {
        addOccurrence(
          kind === "zh_source" ? output.zhSource : output.nonZhSource,
          value,
          sourceFile.fileName,
          lineOfPosition(sourceFile, node.getStart(sourceFile)),
        );
      }
    } else if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        const value = normalizeText(span.literal.text);
        const kind = classifySourceText(value);

        if (kind !== "ignore") {
          addOccurrence(
            kind === "zh_source" ? output.zhSource : output.nonZhSource,
            value,
            sourceFile.fileName,
            lineOfPosition(sourceFile, span.literal.getStart(sourceFile)),
          );
        }
      }

      const headValue = normalizeText(node.head.text);
      const headKind = classifySourceText(headValue);

      if (headKind !== "ignore") {
        addOccurrence(
          headKind === "zh_source" ? output.zhSource : output.nonZhSource,
          headValue,
          sourceFile.fileName,
          lineOfPosition(sourceFile, node.head.getStart(sourceFile)),
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function sortOccurrences(values) {
  return values
    .slice()
    .sort((left, right) => left.text.localeCompare(right.text, "zh-Hans-CN"));
}

function evaluateCoverage({
  currentTranslations,
  indexedTranslations,
  zhSourceValues,
  nonZhSourceValues,
}) {
  const covered = [];
  const recoverableFromIndexed = [];
  const missing = [];

  for (const item of zhSourceValues) {
    if (currentTranslations[item.text]) {
      covered.push(item);
      continue;
    }

    if (indexedTranslations[item.text]) {
      recoverableFromIndexed.push({
        ...item,
        ja: indexedTranslations[item.text].ja,
        en: indexedTranslations[item.text].en,
        ko: indexedTranslations[item.text].ko ?? "",
      });
      continue;
    }

    missing.push(item);
  }

  return {
    covered,
    recoverableFromIndexed,
    missing,
    nonZhSource: nonZhSourceValues,
  };
}

async function main() {
  const currentTranslations = await loadCurrentTranslations();
  const indexedTranslations = await loadIndexedTranslations();
  const files = (
    await Promise.all(
      sourceDirectories.map((directory) => readCodeFiles(directory)),
    )
  )
    .flat()
    .sort();
  const collected = {
    zhSource: new Map(),
    nonZhSource: new Map(),
  };

  for (const filePath of files) {
    const sourceText = await fs.readFile(filePath, "utf8");
    const scriptKind = filePath.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : filePath.endsWith(".mjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );
    collectUiStrings(sourceFile, sourceText, collected);
  }

  const zhSourceValues = sortOccurrences([...collected.zhSource.values()]);
  const nonZhSourceValues = sortOccurrences([
    ...collected.nonZhSource.values(),
  ]);
  const report = evaluateCoverage({
    currentTranslations,
    indexedTranslations,
    zhSourceValues,
    nonZhSourceValues,
  });

  console.log(
    JSON.stringify(
      {
        summary: {
          zhSourceCount: zhSourceValues.length,
          nonZhSourceCount: nonZhSourceValues.length,
          coveredCount: report.covered.length,
          recoverableFromIndexedCount: report.recoverableFromIndexed.length,
          missingCount: report.missing.length,
        },
        recoverableFromIndexed: report.recoverableFromIndexed.slice(0, 200),
        missing: report.missing.slice(0, 200),
        nonZhSource: report.nonZhSource.slice(0, 200),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
