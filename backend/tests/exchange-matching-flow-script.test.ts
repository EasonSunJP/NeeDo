import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal Exchange selective matching database checker", () => {
  it("is a local-only rollback flow with matching, privacy, and no-charge invariants", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(
      join(process.cwd(), "scripts/check-exchange-selective-matching-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:exchange-selective-matching-flow"]).toBe(
      "tsx scripts/check-exchange-selective-matching-flow.ts"
    );
    for (const token of [
      "requireSafeExchangeClaimFlowEnvironment",
      "prisma.$transaction",
      "RollbackVerifiedMatchingFlow",
      "ExchangeMatchingService",
      "ExchangeMatchingRepository",
      "match_target_confirmation_required",
      "requiresBudgetConfirmation",
      "requiresTargetConfirmation",
      "adjustmentPreviewWriteFree",
      "BUDGET_INCREASED",
      "TARGET_REDUCED",
      "adjustmentChainVersionLinked",
      "SELECTIVE_MATCHED",
      "exchange.matching.selected.title",
      "exchange.matching.not_selected.title",
      "matched_participant",
      "idempotentReplay",
      "idempotencyConflictRejected",
      "walletAndHoldUnchanged",
      "bookingAndFinancialCountsUnchanged",
      "cleanupVerified"
    ]) {
      expect(source).toContain(token);
    }
    expect(source).toContain("userSequence += 1");
    expect(source).toContain("SELECT LAST_INSERT_ID() AS id");
    expect(source).not.toContain("transaction.category.create");
    expect(source).not.toContain("digits(label.length)");
    const technicianFixture = source.slice(
      source.indexOf("const [selectedTechnician, secondSelectedTechnician, losingTechnician]"),
      source.indexOf("const owner =")
    );
    expect(technicianFixture.match(/select: \{ id: true \}/gu) ?? []).toHaveLength(3);
  });
});
