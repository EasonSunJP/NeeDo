import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { identityApplicationTranslations } from "../src/features/identity-applications/i18n";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

describe("i18n quality audit", () => {
  it("loads translations split into local TypeScript modules", () => {
    const output = execFileSync(process.execPath, ["scripts/i18n-quality-audit.mjs"], {
      cwd: workspaceRoot,
      encoding: "utf8"
    });
    const result = JSON.parse(output) as {
      summary: {
        entryCount: number;
        missingByLanguage: Record<string, number>;
      };
    };

    expect(result.summary.entryCount).toBeGreaterThan(Object.keys(identityApplicationTranslations).length);
    expect(result.summary.missingByLanguage).toEqual({
      "zh-Hant": 0,
      ja: 0,
      en: 0,
      ko: 0
    });
  });
});
