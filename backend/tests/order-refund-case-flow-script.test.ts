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
    expect(source).toContain("affiliateRewardTransaction.findMany");
    expect(source).toContain("ledgerTransaction.findMany");
    expect(source).toContain("afterEvidenceOrder");
    expect(source).toContain("afterReceiptOrder");
    expect(source).toContain("transaction.financeReconciliation.deleteMany");
    expect(source).toContain("transaction.walletLedger.deleteMany");
    expect(source).toContain("where: { transactionId: { in: ledgerTransactionIds } }");
    const financeReconciliationCleanup = source.indexOf(
      "transaction.financeReconciliation.deleteMany"
    );
    const walletLedgerCleanup = source.indexOf("transaction.walletLedger.deleteMany");
    const ledgerCleanup = source.indexOf("transaction.ledgerTransaction.deleteMany");
    expect(financeReconciliationCleanup).toBeGreaterThan(-1);
    expect(walletLedgerCleanup).toBeGreaterThan(financeReconciliationCleanup);
    expect(ledgerCleanup).toBeGreaterThan(walletLedgerCleanup);

    const dangerousStatements = [/DROP\s+TABLE/i, /TRUNCATE\s+TABLE/i];
    expect(dangerousStatements.some((pattern) => pattern.test("DROP TABLE refund_cases"))).toBe(
      true
    );
    expect(dangerousStatements.some((pattern) => pattern.test("TRUNCATE TABLE refund_cases"))).toBe(
      true
    );
    expect(dangerousStatements.some((pattern) => pattern.test("DROP index refund_cases"))).toBe(
      false
    );
    expect(dangerousStatements.some((pattern) => pattern.test("TRUNCATE refund_cases"))).toBe(
      false
    );
    for (const pattern of dangerousStatements) expect(source).not.toMatch(pattern);
  });
});
