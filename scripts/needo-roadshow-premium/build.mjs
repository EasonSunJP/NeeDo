import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { AI_ASSETS } from "./assets.mjs";
import * as components from "./components.mjs";
import { premiumSlides } from "./content.mjs";
import { THEME, addDarkBase, addLightBase, createDeck } from "./theme.mjs";
import { buildMarketSlides } from "./slides/market.mjs";
import { buildProductSlides } from "./slides/product.mjs";
import { buildBusinessSlides } from "./slides/business.mjs";
import * as data from "../needo-roadshow/data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

function readIntegerFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value)) throw new Error(`${name} requires an integer`);
  return value;
}

function readStringFlag(name) {
  const indexes = process.argv.reduce((matches, value, index) => (
    value === name ? [...matches, index] : matches
  ), []);
  if (indexes.length === 0) return null;
  if (indexes.length > 1) throw new Error(`${name} may only be provided once`);

  const value = process.argv[indexes[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a directory path`);
  return value;
}

function validateOutputDirectory(value) {
  const resolved = path.resolve(value);
  const filesystemRoot = path.parse(resolved).root;
  if (!path.isAbsolute(value) || resolved === filesystemRoot) {
    throw new Error("--output-dir must be an absolute, non-root directory");
  }
  return resolved;
}

async function normalizePackedChartFonts(pptxPath, fontFace) {
  const archive = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const chartNames = Object.keys(archive.files)
    .filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));

  for (const chartName of chartNames) {
    const chartPart = archive.file(chartName);
    const xml = await chartPart.async("string");
    const normalized = xml.replace(/typeface="Arial"/g, `typeface="${fontFace}"`);
    if (normalized !== xml) archive.file(chartName, normalized);
  }

  const packed = await archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(pptxPath, packed);
}

const from = readIntegerFlag("--from", 1);
const through = readIntegerFlag("--through", 9);
if (from < 1 || through > 26 || from > through) {
  throw new Error("Premium checkpoint range must satisfy 1 <= --from <= --through <= 26; slides 27–34 are intentionally not built yet.");
}

const deck = createDeck();
const theme = {
  ...THEME,
  addDarkBase,
  addLightBase,
};
const builders = [
  { first: 1, last: 9, build: buildMarketSlides },
  { first: 10, last: 18, build: buildProductSlides },
  { first: 19, last: 26, build: buildBusinessSlides },
];

const selectedBuilders = builders.filter(({ first, last }) => from <= first && last <= through);
const expectedSlides = through - from + 1;
const coveredSlides = selectedBuilders.reduce((total, { first, last }) => total + last - first + 1, 0);
if (coveredSlides !== expectedSlides) {
  throw new Error("Checkpoint ranges must align to completed slide groups: 1–9, 10–18, and/or 19–26.");
}

const context = {
  pptx: deck,
  deck,
  theme,
  components,
  content: premiumSlides,
  data,
  assets: AI_ASSETS,
};
for (const builder of selectedBuilders) {
  builder.build(context);
}

const pageRange = `${String(from).padStart(2, "0")}-${String(through).padStart(2, "0")}`;
const defaultOutputDirectory = path.join(
  projectRoot,
  `outputs/needo-roadshow-premium-2026-08-23/checkpoint-${pageRange}`,
);
const requestedOutputDirectory = readStringFlag("--output-dir")
  ?? process.env.NEEDO_PREMIUM_OUTPUT_DIR
  ?? defaultOutputDirectory;
const outputDirectory = validateOutputDirectory(requestedOutputDirectory);
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(
  outputDirectory,
  `NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23_第${pageRange}頁檢查點.pptx`,
);
await deck.writeFile({ fileName: outputPath });
await normalizePackedChartFonts(outputPath, THEME.font);

console.log(JSON.stringify({ outputPath, from, through, slides: expectedSlides }, null, 2));
