import { readFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json";
import {
  assertTestNdpMigrationPreflight,
  assertSafeTestNdpRuntime,
  assertTestNdpFoundation,
  readTestNdpMigrationPreflightSnapshot,
  resolveTestNdpCheckPhase,
  type TestNdpMigrationPreflightSnapshot,
  type TestNdpFoundationSnapshot
} from "../scripts/check-test-ndp-foundation";
import { readTestNdpBackfillPreview } from "../scripts/backfill-test-ndp";

const validSnapshot = (): TestNdpFoundationSnapshot => ({
  activeUserCount: 20,
  nonTestUserCount: 0,
  userWalletCount: 20,
  nonTargetBalanceCount: 0,
  testNdpAvailableBalanceTotal: 2_000_000,
  testNdpFrozenBalanceTotal: 0,
  currencyMismatchCount: 0,
  formalExportableTestRows: 0
});

describe("Test NDP foundation scripts", () => {
  it("routes preflight separately from post-migration foundation checks", () => {
    expect(resolveTestNdpCheckPhase(["--phase=preflight"])).toBe("preflight");
    expect(resolveTestNdpCheckPhase(["--phase=postflight"])).toBe("postflight");
    expect(() => resolveTestNdpCheckPhase(["--phase=unknown"])).toThrow(
      "Test NDP check requires --phase=preflight or --phase=postflight."
    );
  });

  it("checks migration collisions and financial relationships without querying new columns", async () => {
    const queries: string[] = [];
    const client = {
      $queryRawUnsafe: jest.fn(async (query: string) => {
        queries.push(query);
        return [{ count: 0, total: 0 }];
      })
    };

    const snapshot = await readTestNdpMigrationPreflightSnapshot(client);

    expect(() => assertTestNdpMigrationPreflight(snapshot)).not.toThrow();
    expect(queries.join("\n")).not.toContain("is_test_account");
    expect(queries.join("\n")).not.toContain("wallet_holds.currency");
    expect(queries.join("\n")).not.toContain("order_financials.ndp_currency");
    expect(() =>
      assertTestNdpMigrationPreflight({
        ...snapshot,
        walletCurrencyCollisionCount: 1
      } satisfies TestNdpMigrationPreflightSnapshot)
    ).toThrow("NDP and Test NDP wallets would collide");
  });

  it("previews legacy NDP balances before the Test NDP schema exists", async () => {
    const client = {
      $queryRawUnsafe: jest.fn(async (query: string) => {
        expect(query).toContain("FROM users u");
        return [
          { id: 1, isTestAccount: 0, walletId: 11, availableBalance: 40_000 },
          { id: 2, isTestAccount: 0, walletId: 12, availableBalance: 100_000 }
        ];
      })
    };

    await expect(readTestNdpBackfillPreview(client, false)).resolves.toMatchObject({
      schemaReady: false,
      users: 2,
      wallets: 2,
      proposedCredits: 1,
      proposedCreditAmount: 60_000,
      unchanged: 1
    });
    expect(client.$queryRawUnsafe.mock.calls[0]?.[0]).toContain("w.currency = 'NDP'");
    expect(client.$queryRawUnsafe.mock.calls[0]?.[0]).not.toContain("is_test_account");
  });

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
      if (key === "activeUserCount" || key === "testNdpFrozenBalanceTotal") continue;
      invalid[key] = 1;
      expect(() => assertTestNdpFoundation(invalid)).toThrow();
    }
  });
});
