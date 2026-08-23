import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const { describe, it } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

describe("premium checkpoint CLI", () => {
  it("builds the completed 19–26 group as exactly eight slides", () => {
    const result = spawnSync(process.execPath, [
      "scripts/needo-roadshow-premium/build.mjs",
      "--from",
      "19",
      "--through",
      "26",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.from, 19);
    assert.equal(payload.through, 26);
    assert.equal(payload.slides, 8);
    assert.match(payload.outputPath, /checkpoint-19-26/);
  });
});
