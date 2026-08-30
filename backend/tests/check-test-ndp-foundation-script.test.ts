import { readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json";
import {
  assertSafeTestNdpRuntime,
  assertTestNdpFoundation,
  type TestNdpFoundationSnapshot
} from "../scripts/check-test-ndp-foundation";

const validSnapshot = (): TestNdpFoundationSnapshot => ({
  activeUserCount: 20,
  nonTestUserCount: 0,
  userWalletCount: 20,
  nonTargetBalanceCount: 0,
  currencyMismatchCount: 0,
  formalExportableTestRows: 0
});

describe("Test NDP foundation scripts", () => {
  it("registers guarded check and explicit-apply backfill commands", () => {
    expect(packageJson.scripts["backfill:test-ndp"]).toBe(
      "ENV_FILE=.env.dev tsx scripts/backfill-test-ndp.ts"
    );
    expect(packageJson.scripts["check:test-ndp-foundation"]).toBe(
      "ENV_FILE=.env.dev tsx scripts/check-test-ndp-foundation.ts"
    );
    const backfill = readFileSync(join(process.cwd(), "scripts/backfill-test-ndp.ts"), "utf8");
    expect(backfill).toContain('process.argv.includes("--apply")');
    expect(backfill).toContain("assertSafeTestNdpRuntime");
    expect(backfill).toContain("await import");
  });

  it.each([
    [{ NODE_ENV: "production", DATABASE_URL: "mysql://root:x@127.0.0.1/needo_dev" }],
    [{ DEPLOY_ENV: "staging", DATABASE_URL: "mysql://root:x@127.0.0.1/needo_dev" }],
    [{ NODE_ENV: "development", DATABASE_URL: "mysql://root:x@db.example.com/needo_dev" }],
    [{ NODE_ENV: "development", DATABASE_URL: "mysql://root:x@localhost/needo_production" }]
  ])("rejects unsafe database targets before Prisma is loaded", (environment) => {
    expect(() => assertSafeTestNdpRuntime(environment)).toThrow(
      "Test NDP commands are allowed only for a local non-production MySQL database."
    );
  });

  it("accepts the local development database and asserts every invariant", () => {
    expect(() =>
      assertSafeTestNdpRuntime({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://root:x@127.0.0.1:3307/needo_dev"
      })
    ).not.toThrow();
    expect(() => assertTestNdpFoundation(validSnapshot())).not.toThrow();
    for (const key of Object.keys(validSnapshot()) as Array<keyof TestNdpFoundationSnapshot>) {
      const invalid = validSnapshot();
      if (key === "activeUserCount") continue;
      invalid[key] = 1;
      expect(() => assertTestNdpFoundation(invalid)).toThrow();
    }
  });
});
