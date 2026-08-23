import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AI_ASSETS } from "./assets.mjs";

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
