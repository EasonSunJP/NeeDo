import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import JSZip from "jszip";

const { describe, it } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const buildScript = "scripts/needo-roadshow-premium/build.mjs";
const officialCheckpoint = path.resolve(
  "outputs/needo-roadshow-premium-2026-08-23/checkpoint-19-26/NeeDo_海外投資人路演_BP_LINE節奏_AI精緻版_2026-08-23_第19-26頁檢查點.pptx",
);

function runBuild(outputDirectory, { env = {}, extraArgs = [] } = {}) {
  return spawnSync(process.execPath, [
    buildScript,
    "--from",
    "19",
    "--through",
    "26",
    "--output-dir",
    outputDirectory,
    ...extraArgs,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function officialCheckpointMtime() {
  return fs.existsSync(officialCheckpoint) ? fs.statSync(officialCheckpoint).mtimeMs : null;
}

describe("premium checkpoint CLI", () => {
  it("builds 19–26 into an isolated output directory without touching the official checkpoint", () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "needo-premium-build-test-"));
    const officialMtimeBefore = officialCheckpointMtime();

    try {
      const result = runBuild(outputDirectory);

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.from, 19);
      assert.equal(payload.through, 26);
      assert.equal(payload.slides, 8);
      assert.equal(path.dirname(payload.outputPath), outputDirectory);
      assert.equal(fs.existsSync(payload.outputPath), true);
      assert.equal(officialCheckpointMtime(), officialMtimeBefore);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it("prefers the CLI output directory over the environment fallback", () => {
    const cliDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "needo-premium-cli-"));
    const environmentDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "needo-premium-env-"));

    try {
      const result = runBuild(cliDirectory, {
        env: { NEEDO_PREMIUM_OUTPUT_DIR: environmentDirectory },
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(path.dirname(payload.outputPath), cliDirectory);
      assert.deepEqual(fs.readdirSync(environmentDirectory), []);
    } finally {
      fs.rmSync(cliDirectory, { recursive: true, force: true });
      fs.rmSync(environmentDirectory, { recursive: true, force: true });
    }
  });

  it("rejects relative or filesystem-root output directories", () => {
    for (const invalidDirectory of ["relative-output", path.parse(process.cwd()).root]) {
      const result = runBuild(invalidDirectory);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--output-dir must be an absolute, non-root directory/);
    }
  });

  it("packs every Task 6 chart label font as Arial Unicode MS without an Arial fallback", async () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "needo-premium-ooxml-"));

    try {
      const result = runBuild(outputDirectory);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      const archive = await JSZip.loadAsync(fs.readFileSync(payload.outputPath));
      const chartNames = Object.keys(archive.files)
        .filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name))
        .sort();

      assert.equal(chartNames.length, 3);
      for (const chartName of chartNames) {
        const xml = await archive.file(chartName).async("string");
        const typefaces = [...xml.matchAll(/<a:latin typeface="([^"]+)"/g)]
          .map(([, typeface]) => typeface);

        assert.ok(typefaces.length > 0, `${chartName} should declare chart label fonts`);
        assert.deepEqual([...new Set(typefaces)], ["Arial Unicode MS"]);
        assert.doesNotMatch(xml, /typeface="Arial"/);
      }
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
