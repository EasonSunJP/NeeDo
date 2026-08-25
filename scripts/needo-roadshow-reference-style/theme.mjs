import path from "node:path";

const outputDir = path.resolve("outputs/needo-roadshow-reference-style-2026-08-23");

export const THEME = Object.freeze({
  size: { width: 13.333, height: 7.5 },
  fontFace: "Arial Unicode MS",
  numberFontFace: "Arial",
  colors: Object.freeze({
    warmWhite: "FBFAF7",
    white: "FFFFFF",
    deepGreen: "0B5943",
    green: "2E8B62",
    mint: "88CFA8",
    mist: "E9F4ED",
    paleGreen: "D5E8DA",
    text: "101A16",
    muted: "66736D",
    orange: "F39A24",
    softOrange: "FDE9CE",
    risk: "A85D55",
    conservative: "8A9B92",
  }),
  margin: 0.5,
  cardRadius: 0.16,
});

export const LAYOUT_FAMILIES = Object.freeze([
  "hero-scene",
  "summary-network",
  "evidence-cards",
  "process-flow",
  "central-orbit",
  "comparison",
  "native-chart",
  "city-roadmap",
  "data-index",
]);

export const OUTPUT_PATHS = Object.freeze({
  dir: outputDir,
  pptx: path.join(outputDir, "NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pptx"),
  pdf: path.join(outputDir, "NeeDo_海外投資人路演_BP_參考風格精緻版_2026-08-23.pdf"),
  contactSheet: path.join(outputDir, "contact-sheet-reference-style.png"),
  sourceManifest: path.join(outputDir, "source-manifest-reference-style.json"),
  extractedText: path.join(outputDir, "extracted-text-reference-style.txt"),
  verification: path.join(outputDir, "verification-reference-style.json"),
});
