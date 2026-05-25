import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const staleMineNavigationPattern =
  /=>\{if\(([A-Za-z_$][\w$]*)==="mine"\)\{[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\);return\}[A-Za-z_$][\w$]*\(\1\)\}/;

function parseArgs(argv) {
  const args = {
    distDir: "dist",
    label: "local dist",
    mainJsPath: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dist-dir") {
      args.distDir = argv[index + 1] ?? args.distDir;
      index += 1;
      continue;
    }

    if (arg === "--main-js") {
      args.mainJsPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--label") {
      args.label = argv[index + 1] ?? args.label;
      index += 1;
    }
  }

  return args;
}

function snippetAround(text, index) {
  return text.slice(Math.max(0, index - 120), index + 220);
}

async function readDistMainBundle(distDir) {
  const htmlPath = path.join(distDir, "user.html");
  const html = await readFile(htmlPath, "utf8");
  const portalEntryName = html.match(/\.\/assets\/(portal-entry-[^"']+\.js)/)?.[1];

  if (!portalEntryName) {
    throw new Error(`Could not find portal-entry asset in ${htmlPath}`);
  }

  const portalPath = path.join(distDir, "assets", portalEntryName);
  const portalEntry = await readFile(portalPath, "utf8");
  const mainNameFromPortal = portalEntry.match(/\.\/(main-[^"')]+\.js)/)?.[1];
  const mainName =
    mainNameFromPortal ??
    (await readdir(path.join(distDir, "assets"))).find((fileName) => /^main-.*\.js$/.test(fileName));

  if (!mainName) {
    throw new Error(`Could not find main bundle through ${portalPath}`);
  }

  const mainPath = path.join(distDir, "assets", mainName);

  return {
    label: `${distDir}/${mainName}`,
    text: await readFile(mainPath, "utf8")
  };
}

async function readMainBundle(args) {
  if (args.mainJsPath) {
    return {
      label: args.mainJsPath,
      text: await readFile(args.mainJsPath, "utf8")
    };
  }

  return readDistMainBundle(args.distDir);
}

function verifySocialMineBundle({ label, text }) {
  if (!text.includes('label:"我的动态",value:"mine"')) {
    throw new Error(`${label} does not contain the social timeline mine tab.`);
  }

  const staleMatch = text.match(staleMineNavigationPattern);

  if (staleMatch?.index !== undefined) {
    throw new Error(
      [
        `${label} still contains the stale mine-tab navigation branch.`,
        "The mine tab must only switch the timeline filter and must not navigate to /me or /profiles.",
        snippetAround(text, staleMatch.index)
      ].join("\n")
    );
  }
}

const args = parseArgs(process.argv.slice(2));
const bundle = await readMainBundle(args);

verifySocialMineBundle(bundle);

console.log(`[social-mine-route] ${args.label}: checked ${bundle.label}`);
console.log("[social-mine-route] 我的动态 stays inside the timeline filter.");
