import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENE_ASSETS } from "./assets.mjs";
import {
  addBase,
  addCard,
  addDisclosure,
  addFlowStep,
  addHeroNumber,
  addNativeColumnChart,
  addNativeLineChart,
  addOrbitNode,
  addPill,
  addSource,
  addTitle,
  createDeck,
} from "./components.mjs";
import { LAYOUT_FAMILIES, OUTPUT_PATHS, THEME } from "./theme.mjs";

describe("reference-style visual system", () => {
  it("uses the approved warm-white and green palette", () => {
    expect(THEME.colors).toMatchObject({
      warmWhite: "FBFAF7",
      white: "FFFFFF",
      deepGreen: "0B5943",
      green: "2E8B62",
      mint: "88CFA8",
      mist: "E9F4ED",
      orange: "F39A24",
      text: "101A16",
    });
  });

  it("defines at least eight layout families", () => {
    expect(new Set(LAYOUT_FAMILIES).size).toBeGreaterThanOrEqual(8);
  });

  it("writes into a separate reference-style output", () => {
    expect(OUTPUT_PATHS.pptx).toContain("needo-roadshow-reference-style-2026-08-23");
    expect(OUTPUT_PATHS.pptx).toContain("參考風格精緻版");
  });

  it("maps nine accepted 16:9 3D scene assets", () => {
    expect(Object.keys(SCENE_ASSETS)).toHaveLength(9);
    for (const file of Object.values(SCENE_ASSETS)) {
      expect(file.endsWith(".png")).toBe(true);
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it("records mascot removal for every scene", () => {
    const manifest = JSON.parse(
      fs.readFileSync("assets/needo-roadshow-reference-style/manifest.json", "utf8"),
    );
    expect(manifest).toHaveLength(9);
    expect(manifest.every((asset) => asset.mascotRemoved === true)).toBe(true);
  });

  it("exports the complete reference-style component contract", () => {
    for (const component of [
      createDeck, addBase, addTitle, addCard, addHeroNumber, addPill,
      addSource, addDisclosure, addNativeColumnChart, addNativeLineChart,
      addFlowStep, addOrbitNode,
    ]) {
      expect(component).toBeTypeOf("function");
    }
  });
});
