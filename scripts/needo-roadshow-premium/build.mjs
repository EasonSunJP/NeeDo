import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AI_ASSETS } from "./assets.mjs";
import * as components from "./components.mjs";
import { premiumSlides } from "./content.mjs";
import { THEME, addDarkBase, addLightBase, createDeck } from "./theme.mjs";
import { buildMarketSlides } from "./slides/market.mjs";
import { buildProductSlides } from "./slides/product.mjs";
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

const from = readIntegerFlag("--from", 1);
const through = readIntegerFlag("--through", 9);
if (from < 1 || through > 18 || from > through) {
  throw new Error("Premium checkpoint range must satisfy 1 <= --from <= --through <= 18; slides 19–34 are intentionally not built yet.");
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
];

const selectedBuilders = builders.filter(({ first, last }) => from <= first && last <= through);
const expectedSlides = through - from + 1;
const coveredSlides = selectedBuilders.reduce((total, { first, last }) => total + last - first + 1, 0);
if (coveredSlides !== expectedSlides) {
  throw new Error("Checkpoint ranges must align to completed slide groups: 1–9 and/or 10–18.");
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
const outputDirectory = path.join(
  projectRoot,
  `outputs/needo-roadshow-premium-2026-08-23/checkpoint-${pageRange}`,
);
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(
  outputDirectory,
  `NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23_第${pageRange}頁檢查點.pptx`,
);
await deck.writeFile({ fileName: outputPath });

console.log(JSON.stringify({ outputPath, from, through, slides: expectedSlides }, null, 2));
