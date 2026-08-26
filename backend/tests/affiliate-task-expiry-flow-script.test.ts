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
    expect(source).toMatch(
      /fullTask\.totalBudgetNdp === 1_000[\s\S]*fullTask\.reservedBudgetNdp === 1_000[\s\S]*fullTask\.allocatedBudgetNdp === 0[\s\S]*fullTask\.settledBudgetNdp === 0[\s\S]*fullTask\.releasedBudgetNdp === 1_000[\s\S]*fullReservation\.totalFrozenNdp === 1_000[\s\S]*fullReservation\.allocatedNdp === 0[\s\S]*fullReservation\.capturedNdp === 0[\s\S]*fullReservation\.releasedNdp === 1_000/
    );
    expect(source).toMatch(
      /zeroTask\.totalBudgetNdp === 1_000[\s\S]*zeroTask\.reservedBudgetNdp === 1_000[\s\S]*zeroTask\.allocatedBudgetNdp === 0[\s\S]*zeroTask\.settledBudgetNdp === 1_000[\s\S]*zeroTask\.releasedBudgetNdp === 0[\s\S]*zeroReservation\.totalFrozenNdp === 1_000[\s\S]*zeroReservation\.allocatedNdp === 0[\s\S]*zeroReservation\.capturedNdp === 1_000[\s\S]*zeroReservation\.releasedNdp === 0/
    );
    expect(source).toMatch(
      /partialTask\.totalBudgetNdp === 2_000[\s\S]*partialTask\.reservedBudgetNdp === 2_000[\s\S]*partialTask\.allocatedBudgetNdp === 500[\s\S]*partialTask\.settledBudgetNdp === 700[\s\S]*partialTask\.releasedBudgetNdp === 800[\s\S]*partialReservation\.totalFrozenNdp === 2_000[\s\S]*partialReservation\.allocatedNdp === 500[\s\S]*partialReservation\.capturedNdp === 700[\s\S]*partialReservation\.releasedNdp === 800/
    );
    expect(source).toMatch(
      /incrementalTask\.totalBudgetNdp === 1_200[\s\S]*incrementalTask\.reservedBudgetNdp === 1_200[\s\S]*incrementalTask\.allocatedBudgetNdp === 0[\s\S]*incrementalTask\.settledBudgetNdp === 400[\s\S]*incrementalTask\.releasedBudgetNdp === 800[\s\S]*incrementalReservation\.totalFrozenNdp === 1_200[\s\S]*incrementalReservation\.allocatedNdp === 0[\s\S]*incrementalReservation\.capturedNdp === 400[\s\S]*incrementalReservation\.releasedNdp === 800/
    );
    expect(source).toMatch(
      /concurrentTask\.totalBudgetNdp === 1_000[\s\S]*concurrentTask\.reservedBudgetNdp === 1_000[\s\S]*concurrentTask\.allocatedBudgetNdp === 0[\s\S]*concurrentTask\.settledBudgetNdp === 0[\s\S]*concurrentTask\.releasedBudgetNdp === 1_000[\s\S]*concurrentReservation\.totalFrozenNdp === 1_000[\s\S]*concurrentReservation\.allocatedNdp === 0[\s\S]*concurrentReservation\.capturedNdp === 0[\s\S]*concurrentReservation\.releasedNdp === 1_000/
    );
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("marker cleanup left affiliate expiry rows behind");
    expect(source).toContain("finally");
    expect(source).not.toContain("deleteMany({})");
  });
});
