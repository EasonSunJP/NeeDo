import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("completed-order refund case real MySQL checker", () => {
  it("is registered, guarded, and emits the required durable proof labels", () => {
    const backendRoot = join(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scriptPath = join(backendRoot, "scripts/check-order-refund-case-flow.ts");

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:order-refund-case-flow"]).toBe(
      "tsx scripts/check-order-refund-case-flow.ts"
    );

    const source = readFileSync(scriptPath, "utf8");
    for (const label of [
      "merchant-approved-refund",
      "merchant-rejected-without-operations",
      "customer-complaint-platform-refund",
      "merchant-complaint-platform-reject",
      "customer-receipt-required",
      "affiliate-reward-preserved",
      "claimant-wallet-preserved",
      "no-affiliate-reversal-transactions",
      "idempotent-replay",
      "stale-version-conflict",
      "cross-shop-hidden",
      "cleanup-complete"
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("ENV_FILE");
    expect(source).toContain("assertSafeLocalDatabase");
    expect(source).toContain("order-refund-case-${Date.now()}");
    expect(source).toContain("finally");
    expect(source).toContain("deleteFormalTestUserFoundations");
    expect(source).not.toMatch(/DROP\\s+TABLE/i);
    expect(source).not.toMatch(/TRUNCATE\\s+TABLE/i);
  });
});
