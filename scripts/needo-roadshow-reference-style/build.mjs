import fs from "node:fs";
import path from "node:path";

import JSZip from "jszip";

import { SCENE_ASSETS } from "./assets.mjs";
import * as components from "./components.mjs";
import { referenceSlides } from "./content.mjs";
import { buildAppendixSlides } from "./slides/appendix.mjs";
import { buildBusinessSlides } from "./slides/business.mjs";
import { buildMarketSlides } from "./slides/market.mjs";
import { buildProductSlides } from "./slides/product.mjs";
import { OUTPUT_PATHS, THEME } from "./theme.mjs";
import * as data from "../needo-roadshow/data.mjs";

function readThrough() {
  const index = process.argv.indexOf("--through");
  if (index === -1) return 34;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 34) {
    throw new Error("--through must be an integer from 1 to 34");
  }
  return value;
}

async function normalizePackedChartFonts(pptxPath, fontFace) {
  const archive = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const chartNames = Object.keys(archive.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
  for (const chartName of chartNames) {
    const part = archive.file(chartName);
    const xml = await part.async("string");
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

const through = readThrough();
const deck = components.createDeck();
const context = {
  pptx: deck,
  deck,
  theme: THEME,
  components,
  content: referenceSlides,
  data,
  assets: SCENE_ASSETS,
};

buildMarketSlides(context, through);
buildProductSlides(context, through);
buildBusinessSlides(context, through);
buildAppendixSlides(context, through);

const outputDirectory = through === 34
  ? OUTPUT_PATHS.dir
  : path.join(OUTPUT_PATHS.dir, `checkpoint-01-${String(through).padStart(2, "0")}`);
fs.mkdirSync(outputDirectory, { recursive: true });

const outputPath = through === 34
  ? OUTPUT_PATHS.pptx
  : path.join(outputDirectory, `NeeDo_參考風格_第01-${String(through).padStart(2, "0")}頁檢查點.pptx`);

await deck.writeFile({ fileName: outputPath });
await normalizePackedChartFonts(outputPath, THEME.fontFace);

const assetManifest = JSON.parse(
  fs.readFileSync("assets/needo-roadshow-reference-style/manifest.json", "utf8"),
);
const sourceManifest = {
  createdAt: "2026-08-23",
  referencePdf: "/Users/eason/Documents/NeeDo/NeeDoBP_CN_2026-08-14.pdf",
  referenceScope: "visual style only; no legacy copy or financial assumptions reused",
  slides: through,
  assets: assetManifest,
  financialSources: data.sources,
};
const manifestPath = through === 34
  ? OUTPUT_PATHS.sourceManifest
  : path.join(outputDirectory, "source-manifest-reference-style.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`);

console.log(JSON.stringify({ outputPath, manifestPath, slides: through }, null, 2));
