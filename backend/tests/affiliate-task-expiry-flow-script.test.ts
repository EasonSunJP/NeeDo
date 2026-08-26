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
    expect(source).toContain("affiliate-expiry-acceptance-guard");
    expect(source).toContain("FixtureOwnedAffiliateTaskExpiryRepository");
    expect(source).toContain("resolveVerifiedDeadlockVictim");
    expect(source).toContain("requireSuccessfulExpirySummary");
    expect(source).toContain("allowedTaskIds");
    expect(source).toContain("LedgerRepository");
    expect(source).toContain("LedgerService");
    expect(source).toContain("AffiliateCheckoutRepository");
    expect(source).toContain("AffiliateCheckoutService");
    expect(source).toContain("AffiliateLinkTokenService");
    expect(source).toContain("BookingRepository");
    expect(source).toContain("BookingService");
    expect(source).toContain("FeeRuleRepository");
    expect(source).toContain("FeeCalculationService");
    expect(source).toContain("affiliate-task-expiry-${Date.now()}");
    expect(source).toContain("affiliate_task_budget_release");
    expect(source).toContain("deliberately NOT allowed due sentinel");
    expect(source).toContain("sentinel refusal mutated fixture state");
    expect(source).toContain("sentinelRefusedBeforeMutation");
    expect(source).toContain("fully unallocated due task");
    expect(source).toContain("partially allocated and captured due task");
    expect(source).toContain("ended task later incremental release");
    expect(source).toContain("createAttributedOrder");
    expect(source).toContain("settleCompletedBooking");
    expect(source).toContain("invalidateCancelledBooking");
    expect(source).toContain("AffiliateAttribution");
    expect(source).toContain("ATTRIBUTED");
    expect(source).toContain("SETTLED");
    expect(source).toContain("INVALIDATED");
    expect(source).toContain("completion expiry race");
    expect(source).toContain("cancellation expiry race");
    expect(source).toContain("advanceToInService(customerCompletionRace.id");
    expect(source).toMatch(
      /completionRuns = await Promise\.allSettled\([\s\S]{0,500}booking\.transitionOrder\([\s\S]{0,200}"complete"/
    );
    expect(source).toMatch(
      /cancellationRuns = await Promise\.allSettled\([\s\S]{0,500}booking\.transitionOrder\([\s\S]{0,200}"cancel"/
    );
    expect(source).not.toMatch(
      /completionRuns = await Promise\.allSettled\([\s\S]{0,500}settleCompletedBooking/
    );
    expect(source).not.toMatch(
      /cancellationRuns = await Promise\.allSettled\([\s\S]{0,500}invalidateCancelledBooking/
    );
    expect(source).toContain("completionBooking");
    expect(source).toContain("completionHistory");
    expect(source).toContain("completionSlot");
    expect(source).toContain("completionHold");
    expect(source).toContain("completionFinancial");
    expect(source).toContain("completionBookingLedgers");
    expect(source).toContain("cancellationBooking");
    expect(source).toContain("cancellationHistory");
    expect(source).toContain("cancellationSlot");
    expect(source).toContain("cancellationHold");
    expect(source).toContain("cancellationFinancial");
    expect(source).toContain("cancellationBookingLedgers");
    expect(source).toContain("completion outer booking deadlock victim did not roll back");
    expect(source).toContain("cancellation outer booking deadlock victim did not roll back");
    expect(source).toContain("completionReleaseLedgers");
    expect(source).toContain('completionState.reservation.status === "RELEASED"');
    expect(source).toContain('cancellationState.reservation.status === "RELEASED"');
    expect(source).toContain("deadlock");
    expect(source).toContain("immutable endedAt");
    expect(source).toContain("activeKey === null");
    expect(source).toContain("affiliate.reward.settled");
    expect(source).toContain("affiliate.attribution.invalidated");
    expect(source).toContain("AFFILIATE_REWARD_SETTLEMENT");
    expect(source).toContain("AffiliateRewardTransaction");
    expect(source).toContain(
      "zero-unallocated task did not create an empty release ledger transaction"
    );
    expect(source).toContain("walletBeforeExpiry");
    expect(source).toContain("initial expiry wallet delta is incorrect");
    expect(source).toContain("first incremental expiry did not preserve the actual ATTRIBUTED row");
    expect(source).toContain(
      "ended task later incremental release did not preserve cumulative budget state"
    );
    expect(source).toContain("concurrent expiry wallet delta is incorrect");
    expect(source).toContain("totalBudgetNdp === 1_000");
    expect(source).toContain("reservedBudgetNdp === 1_000");
    expect(source).toContain("totalFrozenNdp === 1_000");
    expect(source).toContain("totalBudgetNdp === 2_000");
    expect(source).toContain("reservedBudgetNdp === 2_000");
    expect(source).toContain("totalFrozenNdp === 2_000");
    expect(source).toContain("totalBudgetNdp === 1_200");
    expect(source).toMatch(
      /fullState\.task\.totalBudgetNdp === 1_000[\s\S]*fullState\.task\.reservedBudgetNdp === 1_000[\s\S]*fullState\.task\.allocatedBudgetNdp === 0[\s\S]*fullState\.task\.settledBudgetNdp === 0[\s\S]*fullState\.task\.releasedBudgetNdp === 1_000[\s\S]*fullState\.reservation\.totalFrozenNdp === 1_000[\s\S]*fullState\.reservation\.allocatedNdp === 0[\s\S]*fullState\.reservation\.capturedNdp === 0[\s\S]*fullState\.reservation\.releasedNdp === 1_000/
    );
    expect(source).toMatch(
      /zeroState\.task\.totalBudgetNdp === REWARD_NDP[\s\S]*zeroState\.task\.allocatedBudgetNdp === 0[\s\S]*zeroState\.task\.settledBudgetNdp === REWARD_NDP[\s\S]*zeroState\.task\.releasedBudgetNdp === 0[\s\S]*zeroState\.reservation\.totalFrozenNdp === REWARD_NDP[\s\S]*zeroState\.reservation\.allocatedNdp === 0[\s\S]*zeroState\.reservation\.capturedNdp === REWARD_NDP[\s\S]*zeroState\.reservation\.releasedNdp === 0/
    );
    expect(source).toMatch(
      /partialState\.task\.totalBudgetNdp === 2_000[\s\S]*partialState\.task\.reservedBudgetNdp === 2_000[\s\S]*partialState\.task\.allocatedBudgetNdp === REWARD_NDP[\s\S]*partialState\.task\.settledBudgetNdp === REWARD_NDP[\s\S]*partialState\.task\.releasedBudgetNdp === 1_000[\s\S]*partialState\.reservation\.totalFrozenNdp === 2_000[\s\S]*partialState\.reservation\.allocatedNdp === REWARD_NDP[\s\S]*partialState\.reservation\.capturedNdp === REWARD_NDP[\s\S]*partialState\.reservation\.releasedNdp === 1_000/
    );
    expect(source).toMatch(
      /incrementalState\.task\.totalBudgetNdp === 1_200[\s\S]*incrementalState\.task\.allocatedBudgetNdp === 0[\s\S]*incrementalState\.task\.settledBudgetNdp === 0[\s\S]*incrementalState\.task\.releasedBudgetNdp === 1_200[\s\S]*incrementalState\.reservation\.allocatedNdp === 0[\s\S]*incrementalState\.reservation\.capturedNdp === 0[\s\S]*incrementalState\.reservation\.releasedNdp === 1_200/
    );
    expect(source).toMatch(
      /concurrentState\.task\.totalBudgetNdp === 1_000[\s\S]*concurrentState\.task\.reservedBudgetNdp === 1_000[\s\S]*concurrentState\.task\.allocatedBudgetNdp === 0[\s\S]*concurrentState\.task\.settledBudgetNdp === 0[\s\S]*concurrentState\.task\.releasedBudgetNdp === 1_000[\s\S]*concurrentState\.reservation\.totalFrozenNdp === 1_000[\s\S]*concurrentState\.reservation\.allocatedNdp === 0[\s\S]*concurrentState\.reservation\.capturedNdp === 0[\s\S]*concurrentState\.reservation\.releasedNdp === 1_000/
    );
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("concurrentFailures");
    expect(source).toContain("run.value.failed === 0");
    expect(source).toContain("concurrentFailures.length === 0");
    expect(source).toContain("run.value.released : 0");
    expect(source).toContain("isolation");
    expect(source).toContain("attributionPreservation");
    expect(source).toContain("completionRace");
    expect(source).toContain("cancellationRace");
    expect(source).toContain("marker cleanup left affiliate expiry rows behind");
    expect(source).toContain("walletHold.deleteMany");
    expect(source).toContain("orderFinancial.deleteMany");
    expect(source).toContain("feeCalculationLog.deleteMany");
    expect(source).toContain("platformFeeRule.deleteMany");
    expect(source).toContain("platformFeeRuleSet.deleteMany");
    expect(source).toContain("finally");
    expect(source).not.toMatch(/affiliateTask\.update\([\s\S]{0,300}allocatedBudgetNdp:\s*0/);
    expect(source).not.toMatch(
      /affiliateBudgetReservation\.update\([\s\S]{0,300}allocatedNdp:\s*0/
    );
    expect(source).not.toContain("deleteMany({})");
  });
});
