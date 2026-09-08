import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal Exchange Quick matching database checker", () => {
  it("is guarded, migration-aware, rollback-contained, and proves finance boundaries", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(
      join(process.cwd(), "scripts/check-exchange-quick-matching-flow.ts"),
      "utf8"
    );
    const safety = readFileSync(
      join(process.cwd(), "scripts/support/exchange-claim-flow-safety.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:exchange-quick-matching-flow"]).toBe(
      "tsx scripts/check-exchange-quick-matching-flow.ts"
    );
    for (const token of [
      "requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE",
      "assertRepositoryMigrationsApplied",
      "RollbackVerifiedExchangeQuickMatching",
      "belowBudgetAutoMatched",
      "overBudgetDecisionExact",
      "thirdClaimRejected",
      "quickMatchEventExactlyOnce",
      "idempotentReplay",
      "idempotencyConflictRejected",
      "publicationFeeStillHeld",
      "walletHoldLedgerReconciliationUnchanged",
      "bookingAndPaymentRowsZero",
      "matchedParticipantPrivacy",
      "cleanupVerified"
    ]) {
      expect(source).toContain(token);
    }
    expect(safety).toContain("requires an explicit ENV_FILE");
    expect(safety).toContain("rejects production and staging runtimes");
    expect(safety).toContain("only accepts localhost or 127.0.0.1");
    expect(safety).toContain("rejects production-looking database names");
    expect(source).not.toMatch(/console\.log\([^\n]*(?:password|token|DATABASE_URL)/iu);
    expect(source).not.toMatch(/deleteMany\(\s*\{\s*\}\s*\)/u);
  });
});
