import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AI_ASSETS } from "./assets.mjs";
import * as components from "./components.mjs";
import {
  DARK_PAGES,
  LAYOUT_FAMILIES,
  THEME,
  addDarkBase,
  addLightBase,
  createDeck,
} from "./theme.mjs";

const EXPECTED_KEYS = ["coordination", "cover", "cps", "ordering", "scheduling"];
const ASSET_DIRECTORY = "assets/needo-roadshow-premium/ai/";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function projectRelative(file) {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

function readPngDimensions(buffer) {
  expect(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("premium AI assets", () => {
  it("maps exactly five project-local PNG assets", () => {
    expect(Object.keys(AI_ASSETS).sort()).toEqual(EXPECTED_KEYS);

    Object.values(AI_ASSETS).forEach((file) => {
      const relative = projectRelative(file);
      expect(relative.startsWith(ASSET_DIRECTORY)).toBe(true);
      expect(relative.endsWith(".png")).toBe(true);
      expect(fs.existsSync(file)).toBe(true);
    });
  });

  it("keeps every image large enough and approximately 16:9", () => {
    Object.values(AI_ASSETS).forEach((file) => {
      const { width, height } = readPngDimensions(fs.readFileSync(file));
      expect(width).toBeGreaterThanOrEqual(1536);
      expect(height).toBeGreaterThanOrEqual(864);
      expect(Math.abs(width / height - 16 / 9)).toBeLessThanOrEqual(0.02);
    });
  });

  it("records exactly five prompts with matching SHA-256 hashes", () => {
    const promptsFile = path.resolve(process.cwd(), ASSET_DIRECTORY, "prompts.json");
    const prompts = JSON.parse(fs.readFileSync(promptsFile, "utf8"));

    expect(prompts).toHaveLength(5);
    expect(prompts.map(({ id }) => id).sort()).toEqual(EXPECTED_KEYS);

    prompts.forEach((entry) => {
      expect(Object.keys(entry).sort()).toEqual([
        "approvedUse",
        "createdAt",
        "file",
        "generator",
        "id",
        "prompt",
        "sha256",
      ]);
      expect(entry.file.startsWith(ASSET_DIRECTORY)).toBe(true);
      expect(entry.file).toBe(projectRelative(AI_ASSETS[entry.id]));
      expect(entry.prompt.trim()).not.toBe("");
      expect(entry.generator.trim()).not.toBe("");
      expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
      expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
      expect(entry.approvedUse).toBe("validated for specified deck use");

      const hash = crypto.createHash("sha256").update(fs.readFileSync(AI_ASSETS[entry.id])).digest("hex");
      expect(entry.sha256).toBe(hash);
    });
  });
});

describe("premium visual system", () => {
  it("uses the approved palette without hash-prefixed hex values", () => {
    expect(THEME.colors).toMatchObject({
      white: "FFFFFF",
      coolWhite: "F7FAF8",
      mist: "E7F1EC",
      sage: "72A58B",
      green: "4F896D",
      dataGreen: "4F896D",
      deepForest: "173C2E",
      nightForest: "102D23",
      orange: "D8946B",
      risk: "A75852",
    });

    Object.values(THEME.colors).forEach((color) => {
      expect(color).toMatch(/^[0-9A-F]{6}$/);
      expect(color.startsWith("#")).toBe(false);
    });
  });

  it("locks exactly seven dark pages and at least six distinct layout families", () => {
    expect(DARK_PAGES).toEqual([2, 10, 16, 19, 26, 31, 34]);
    expect(new Set(LAYOUT_FAMILIES).size).toBeGreaterThanOrEqual(6);
  });

  it("creates a fresh 16:9 wide deck with both premium masters", () => {
    const first = createDeck();
    const second = createDeck();

    expect(first).not.toBe(second);
    expect(first.layout).toBe("LAYOUT_WIDE");
    expect(first.presLayout.width / 914400).toBeCloseTo(13.333, 3);
    expect(first.presLayout.height / 914400).toBeCloseTo(7.5, 3);
    expect(first.slideLayouts.map(({ _name }) => _name)).toEqual(
      expect.arrayContaining(["NEEDO_PREMIUM_LIGHT", "NEEDO_PREMIUM_DARK"]),
    );
  });

  it("exports the reusable native PowerPoint component interface", () => {
    [
      "addHeroNumber",
      "addInsight",
      "addSource",
      "addNativeBarChart",
      "addNativeLineChart",
      "addOrbitNode",
      "addDisclosure",
    ].forEach((name) => expect(components[name]).toBeTypeOf("function"));
  });

  it("keeps ambient base shapes fully inside the public slide bounds", () => {
    const calls = [];
    const slide = {
      addShape: (...args) => calls.push(args),
      addText: () => {},
    };
    const deck = {
      ShapeType: { ellipse: "ellipse" },
    };

    addLightBase(slide, deck, { title: "Light", page: 1 });
    addDarkBase(slide, deck, { title: "Dark", page: 2 });

    const ambientShapes = calls
      .map(([, options]) => options)
      .filter(({ objectName = "" }) => /ambient halo|glass node/.test(objectName));

    expect(ambientShapes).toHaveLength(4);
    ambientShapes.forEach(({ x, y, w, h }) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(THEME.layout.width);
      expect(y + h).toBeLessThanOrEqual(THEME.layout.height);
    });
  });

  it("builds aligned native shapes, text, and charts with fresh option objects", () => {
    const calls = [];
    const slide = {
      addChart: (...args) => calls.push(["chart", ...args]),
      addShape: (...args) => calls.push(["shape", ...args]),
      addText: (...args) => calls.push(["text", ...args]),
    };
    const deck = {
      ChartType: { bar: "bar", line: "line" },
      ShapeType: { ellipse: "ellipse", line: "line", roundRect: "roundRect" },
    };

    addLightBase(slide, deck, { title: "Light", page: 1 });
    addDarkBase(slide, deck, { title: "Dark", page: 2 });
    components.addHeroNumber(slide, deck, { value: "100+", label: "使用意向" });
    components.addInsight(slide, deck, { text: "單頁單結論" });
    components.addSource(slide, "S1");
    components.addNativeBarChart(slide, deck, {
      series: [{ name: "店鋪", labels: ["Y1", "Y2"], values: [600, 2400] }],
    });
    components.addNativeLineChart(slide, deck, {
      series: [{ name: "營收", labels: ["Y1", "Y2"], values: [1, 2] }],
    });
    components.addOrbitNode(slide, deck, { label: "NeeDo" });
    components.addDisclosure(slide, deck, { text: "情境分析，不構成承諾。" });

    const textOptions = calls.filter(([kind]) => kind === "text").map(([, , options]) => options);
    const chartCalls = calls.filter(([kind]) => kind === "chart");
    expect(textOptions.length).toBeGreaterThan(0);
    textOptions.forEach((options) => expect(options.margin).toBe(0));
    expect(new Set(textOptions).size).toBe(textOptions.length);
    expect(chartCalls.map(([, type]) => type)).toEqual(["bar", "line"]);
    chartCalls.forEach(([, , , options]) => {
      expect(options.altText).toBeTruthy();
      expect(options.dataLabelFontFace).toBe(THEME.font);
      expect(options.chartColors.every((color) => !color.startsWith("#"))).toBe(true);
    });
  });
});
