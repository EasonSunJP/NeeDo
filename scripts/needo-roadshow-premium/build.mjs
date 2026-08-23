import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AI_ASSETS } from "./assets.mjs";
import * as components from "./components.mjs";
import { premiumSlides } from "./content.mjs";
import { THEME, addDarkBase, addLightBase, createDeck } from "./theme.mjs";
import { buildMarketSlides } from "./slides/market.mjs";
import * as data from "../needo-roadshow/data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const outputDirectory = path.join(projectRoot, "outputs/needo-roadshow-premium-2026-08-23/checkpoint-01-09");

function readIntegerFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value)) throw new Error(`${name} requires an integer`);
  return value;
}

const through = readIntegerFlag("--through", 9);
if (through !== 9) {
  throw new Error("Task 4 checkpoint supports only --through 9; slides 10–34 are intentionally not built yet.");
}

const deck = createDeck();
const theme = {
  ...THEME,
  addDarkBase,
  addLightBase,
};
const builders = [
  { first: 1, last: 9, build: buildMarketSlides },
];

for (const builder of builders) {
  if (builder.first <= through) {
    builder.build({
      pptx: deck,
      deck,
      theme,
      components,
      content: premiumSlides,
      data,
      assets: AI_ASSETS,
    });
  }
}

if (deck._slides.length !== through) {
  throw new Error(`Expected ${through} checkpoint slides, built ${deck._slides.length}`);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(
  outputDirectory,
  "NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23_第01-09頁檢查點.pptx",
);
await deck.writeFile({ fileName: outputPath });

console.log(JSON.stringify({ outputPath, slides: deck._slides.length }, null, 2));
