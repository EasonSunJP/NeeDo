import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

describe("i18n source audit", () => {
  it(
    "loads translation modules that have relative runtime dependencies",
    () => {
      const output = execFileSync(process.execPath, ["scripts/i18n-audit.mjs"], {
        cwd: workspaceRoot,
        encoding: "utf8",
      });
      const report = JSON.parse(output);

      expect(report.summary.zhSourceCount).toBeGreaterThan(0);
      expect(report.summary.coveredCount).toBeGreaterThan(0);
    },
    30_000,
  );
});
