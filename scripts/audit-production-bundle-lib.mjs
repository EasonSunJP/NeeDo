import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const forbiddenRuntimeMarkers = [
  "needoStaticDemo",
  "static_demo.local_response",
  "needoExchangeBridge",
  "hashSystemId",
  "getSeedPosts",
  "getExtraPosts",
  "needo.exchange.composed",
  "正式需求与情报功能尚未启用"
];
const defaultBudgets = {
  main: 4_000_000,
  i18n: 3_725_800
};

const nonRuntimeExtension = /\.(psd|psb|ai|sketch|fig|md|docx|zip|rar|7z|bak|orig|tmp|pem|key|p12|pfx)$/i;

async function auditNonRuntimeFiles(root, directory = root) {
  const failures = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isSymbolicLink()) {
      failures.push(`production assets include a symbolic link: ${relative}`);
    } else if (entry.isDirectory()) {
      failures.push(...await auditNonRuntimeFiles(root, absolute));
    } else if (entry.isFile() && (entry.name === ".DS_Store" || nonRuntimeExtension.test(entry.name))) {
      failures.push(`production assets include a non-runtime file: ${relative}`);
    }
  }
  return failures;
}

async function listFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function auditProductionBundle(distDir, budgets = defaultBudgets) {
  const assetsDir = path.join(distDir, "assets");
  const assetNames = await listFiles(assetsDir);
  const htmlNames = (await listFiles(distDir)).filter((name) => name.endsWith(".html"));
  const failures = await auditNonRuntimeFiles(distDir);

  if (assetNames.some((name) => /^staticDemo-.*\.js$/.test(name))) {
    failures.push("production assets include a staticDemo JavaScript chunk");
  }

  const javascriptNames = assetNames.filter((name) => name.endsWith(".js"));
  for (const assetName of javascriptNames) {
    const assetPath = path.join(assetsDir, assetName);
    const source = await readFile(assetPath, "utf8");
    const marker = forbiddenRuntimeMarkers.find((candidate) => source.includes(candidate));
    if (marker) {
      failures.push(`${assetName} contains forbidden static runtime marker ${marker}`);
    }
  }

  for (const [prefix, maximumBytes] of Object.entries(budgets)) {
    const matchingName = assetNames.find((name) => name.startsWith(`${prefix}-`) && name.endsWith(".js"));
    if (!matchingName) {
      failures.push(`missing ${prefix} JavaScript asset`);
      continue;
    }

    const size = (await stat(path.join(assetsDir, matchingName))).size;
    if (size > maximumBytes) {
      failures.push(`${matchingName} is ${size} bytes; budget is ${maximumBytes}`);
    }
  }

  for (const htmlName of htmlNames) {
    const html = await readFile(path.join(distDir, htmlName), "utf8");
    const references = [...html.matchAll(/(?:src|href)=["']\.\/assets\/([^"']+)["']/g)].map(
      (match) => match[1]
    );
    for (const reference of references) {
      if (!assetNames.includes(reference)) {
        failures.push(`${htmlName} references missing asset ${reference}`);
      }
    }
  }

  return {
    assetCount: assetNames.length,
    htmlCount: htmlNames.length,
    failures
  };
}
