import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIXTURE_MARKER,
  validatePersistentMultishopEnvironment
} from "../scripts/check-multishop-pricing-settlement-flow";

const scriptPath = resolve(__dirname, "../scripts/check-multishop-pricing-settlement-flow.ts");

describe("persistent multishop pricing and settlement checker", () => {
  it("accepts only a loopback non-production MySQL target", () => {
    expect(() =>
      validatePersistentMultishopEnvironment({
        FORMAL_BACKEND_ENV_FILE: "/tmp/local.env",
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://needo:test@127.0.0.1:3307/needo_dev"
      })
    ).not.toThrow();
    expect(() =>
      validatePersistentMultishopEnvironment({
        FORMAL_BACKEND_ENV_FILE: "/tmp/local.env",
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://needo:test@db.example.com:3306/needo_dev"
      })
    ).toThrow("loopback");
    expect(() =>
      validatePersistentMultishopEnvironment({
        FORMAL_BACKEND_ENV_FILE: "/tmp/local.env",
        NODE_ENV: "production",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://needo:test@127.0.0.1:3307/needo_dev"
      })
    ).toThrow("production");
  });

  it("uses one stable marker and retains accepted evidence without cleanup rollback", () => {
    const source = readFileSync(scriptPath, "utf8");
    expect(FIXTURE_MARKER).toBe("qa-multishop-pricing-settlement-20260909");
    expect(source).toContain("isTestAccount: true");
    expect(source).toContain('pricingMode: "MERCHANT"');
    expect(source).toContain('pricingMode: "TECHNICIAN"');
    expect(source).toContain('relationshipType: "PARTNER"');
    expect(source).toContain("serviceOwnerType");
    expect(source).toContain("TEST_NDP");
    expect(source).toContain("offline_cash");
    expect(source).toContain("technicianIncomePreview");
    expect(source).toContain("listMerchantPayRuns");
    expect(source).toContain("listBackofficePayRuns");
    expect(source).not.toContain("runRollbackOnlyTransaction");
    expect(source).not.toMatch(/\.delete(?:Many)?\s*\(/);
  });
});
