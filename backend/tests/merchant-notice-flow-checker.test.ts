import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("merchant notice local flow checker", () => {
  it("is a guarded rollback checker for formal recipients and management isolation", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const checkerPath = resolve(__dirname, "../scripts/check-merchant-notice-flow.ts");
    expect(packageJson.scripts["check:merchant-notice-flow"]).toBe(
      "tsx scripts/check-merchant-notice-flow.ts"
    );
    expect(existsSync(checkerPath)).toBe(true);
    const source = readFileSync(checkerPath, "utf8");
    expect(source).toContain("ENV_FILE is required");
    expect(source).toContain("explicitly local non-production database");
    expect(source).toContain("merchant notice acceptance rollback");
    for (const proof of [
      "cardholderEligibility",
      "employeeEligibility",
      "technicianEligibility",
      "frozenAudience",
      "crossShopIsolation",
      "platformManagementIsolation",
      "scopeBoundIdempotency",
      "databaseStructure",
      "permissionGrants",
      "negativeAudienceMatrix",
      "inactivePublisherLifecycle",
      "rolledBack"
    ])
      expect(source).toContain(proof);
  });
});
