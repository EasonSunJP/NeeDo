import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate task expiry local MySQL acceptance script", () => {
  it("is registered, guarded, marker-owned, and covers expiry release invariants", () => {
    const backendRoot = join(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scriptPath = join(backendRoot, "scripts/check-affiliate-task-expiry-flow.ts");

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:affiliate-task-expiry-flow"]).toBe(
      "tsx scripts/check-affiliate-task-expiry-flow.ts"
    );

    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("assertSafeAffiliateCompletionDatabase");
    expect(source).toContain("AffiliateTaskExpiryRepository");
    expect(source).toContain("AffiliateTaskExpiryService");
    expect(source).toContain("LedgerRepository");
    expect(source).toContain("LedgerService");
    expect(source).toContain("affiliate-task-expiry-${Date.now()}");
    expect(source).toContain("affiliate_task_budget_release");
    expect(source).toContain("fully unallocated due task");
    expect(source).toContain("partially allocated and captured due task");
    expect(source).toContain("ended task later incremental release");
    expect(source).toContain("zero-unallocated task did not create an empty release ledger transaction");
    expect(source).toContain("walletBeforeExpiry");
    expect(source).toContain("initial expiry wallet delta is incorrect");
    expect(source).toContain("incremental expiry wallet delta is incorrect");
    expect(source).toContain("concurrent expiry wallet delta is incorrect");
    expect(source).toContain("totalBudgetNdp === 1_000");
    expect(source).toContain("reservedBudgetNdp === 1_000");
    expect(source).toContain("totalFrozenNdp === 1_000");
    expect(source).toContain("totalBudgetNdp === 2_000");
    expect(source).toContain("reservedBudgetNdp === 2_000");
    expect(source).toContain("totalFrozenNdp === 2_000");
    expect(source).toContain("totalBudgetNdp === 1_200");
    expect(source).toContain("reservedBudgetNdp === 1_200");
    expect(source).toContain("totalFrozenNdp === 1_200");
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("marker cleanup left affiliate expiry rows behind");
    expect(source).toContain("finally");
    expect(source).not.toContain("deleteMany({})");
  });
});
