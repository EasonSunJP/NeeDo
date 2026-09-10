import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertConcurrentCheckoutEvidence,
  type ConcurrentCheckoutEvidence
} from "../scripts/check-order-checkout-concurrency";

const backendRoot = resolve(__dirname, "..");
const scriptPath = resolve(backendRoot, "scripts/check-order-checkout-concurrency.ts");

const validEvidence = (): ConcurrentCheckoutEvidence => ({
  connectionIds: [101, 202],
  resultStatuses: ["completed", "completed"],
  paymentEvidence: ["ndp_ledger", "ndp_ledger"],
  orderStatus: "COMPLETED",
  paymentStatus: "CONFIRMED",
  checkoutLedgerTransactionId: 91,
  checkoutAmountNdp: 8_800,
  walletBeforeNdp: 100_000,
  walletAfterNdp: 91_200,
  paymentEventCount: 1,
  completedHistoryCount: 1,
  paymentTransactionCount: 1,
  walletLedgerCount: 1,
  paymentAuditCount: 1,
  reconciliationCount: 0
});

describe("formal TEST_NDP checkout concurrency checker", () => {
  it("is wired after the rollback-only fulfillment checker", () => {
    const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:order-fulfillment-checkout"]).toBe(
      "tsx scripts/check-order-fulfillment-checkout-flow.ts && " +
        "tsx scripts/check-order-checkout-concurrency.ts"
    );
  });

  it("accepts exactly one TEST_NDP debit from two independent successful submissions", () => {
    expect(() => assertConcurrentCheckoutEvidence(validEvidence())).not.toThrow();
  });

  it("seeds a checkout-ready fixture without depending on the anytime service switch", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain('status: "AWAITING_CHECKOUT"');
    expect(source).toContain("tx.orderServiceSession.create");
    expect(source).toContain("tx.orderCheckout.create");
    expect(source).toContain('formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount"');
    expect(source).toContain('rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)"');
    expect(source).toContain("acceptedAddOnIds: []");
    expect(source).not.toContain("await serviceA.startService");
    expect(source).not.toContain("await serviceA.endService");
  });

  it.each([
    ["same connection", { connectionIds: [101, 101] }],
    ["one rejected request", { resultStatuses: ["completed", "rejected"] }],
    ["double debit", { walletAfterNdp: 82_400 }],
    ["duplicate event", { paymentEventCount: 2 }],
    ["duplicate transaction", { paymentTransactionCount: 2 }],
    ["production reconciliation", { reconciliationCount: 1 }]
  ])("rejects invalid concurrency evidence: %s", (_label, mutation) => {
    expect(() =>
      assertConcurrentCheckoutEvidence({
        ...validEvidence(),
        ...mutation
      } as ConcurrentCheckoutEvidence)
    ).toThrow("Formal checkout concurrency assertion failed");
  });

  it("keeps safety validation before dynamic database imports and performs exact cleanup", () => {
    const source = readFileSync(scriptPath, "utf8");
    const guard = source.indexOf("loadAndValidateFormalEnvironment(process.env");
    const prismaImport = source.indexOf('await import("../src/prisma/client")');

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(prismaImport).toBeGreaterThan(guard);
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("evidence.connectionIds[0] !== evidence.connectionIds[1]");
    expect(source).toContain("cleanupConcurrentFixture");
    expect(source).toContain("External database baseline changed after concurrency cleanup");
  });
});
