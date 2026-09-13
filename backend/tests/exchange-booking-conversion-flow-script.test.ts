import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal Exchange matched-booking database checker", () => {
  it("is a guarded rollback proof for booking, idempotency, and finance boundaries", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(
      join(process.cwd(), "scripts/check-exchange-booking-conversion-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:exchange-booking-conversion-flow"]).toBe(
      "tsx scripts/check-exchange-booking-conversion-flow.ts"
    );
    for (const token of [
      "requireSafeExchangeClaimFlowEnvironment",
      "RollbackVerifiedExchangeBookingConversion",
      "ExchangeBookingConversionService",
      "ExchangeBookingConversionRepository",
      "participantOrderCountMatches",
      "ordinaryPendingReplaced",
      "sameBatchPendingCoexists",
      "idempotentReplay",
      "idempotencyConflictRejected",
      "staleVersionRejected",
      "slotFailureRolledBack",
      "publicationFinanceUnchanged",
      "walletLedgerReconciliationUnchanged",
      "cleanupVerified"
    ]) {
      expect(source).toContain(token);
    }
    expect(source.indexOf("bookingServiceLocation.deleteMany")).toBeLessThan(
      source.indexOf("bookingOrder.deleteMany")
    );
  });
});
