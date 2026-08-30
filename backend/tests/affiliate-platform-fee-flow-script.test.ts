import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Affiliate platform fee real-database checker", () => {
  const backendRoot = join(__dirname, "..");
  const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const scriptPath = join(backendRoot, "scripts/check-affiliate-platform-fee-flow.ts");

  it("exposes a guarded formal checker command", () => {
    expect(packageJson.scripts["check:affiliate-platform-fee-flow"]).toBe(
      "tsx scripts/check-affiliate-platform-fee-flow.ts"
    );
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("rejects production flags, remote MySQL, and production-like database names", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("assertSafeLocalDatabase");
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('process.env.DEPLOY_ENV !== "prod"');
    expect(source).toContain('["localhost", "127.0.0.1", "[::1]"]');
    expect(source).toContain("/(^|[_-])(prod|production)([_-]|$)/i");
    expect(source).toContain("affiliate-platform-fee-${Date.now()}-${process.pid}");
  });

  it.each([
    "2,200,000 gross freeze",
    "11,000 gross capture",
    "10,000 claimant credit",
    "1,000 platform credit",
    "immutable shop override snapshot",
    "mixed-rate pre-wallet rejection",
    "rejection releases commission and fee",
    "expiry releases commission and fee",
    "idempotent retries",
    "exact cleanup baseline"
  ])("contains the %s acceptance invariant", (invariant) => {
    expect(readFileSync(scriptPath, "utf8")).toContain(invariant);
  });

  it("uses formal services for policy, freeze, release, expiry, and settlement mutations", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("new AffiliatePlatformFeeService(");
    expect(source).toContain("new AffiliateTaskService(");
    expect(source).toContain("new AffiliateTaskExpiryService(");
    expect(source).toContain("new AffiliateCheckoutService(");
    expect(source).toContain("new LedgerService(");
    expect(source).toContain("cleanupMarkerFixture");
    expect(source).toContain("captureBaseline");
    expect(source).toContain("assertExactBaseline");
    expect(source).not.toContain("prisma.wallet.update");
    expect(source).not.toContain("prisma.wallet.updateMany");
  });
});
