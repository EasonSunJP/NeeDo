import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("booking platform fee debt real-database checker", () => {
  const backendRoot = join(__dirname, "..");
  const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const scriptPath = join(backendRoot, "scripts/check-booking-platform-fee-debt-flow.ts");

  it("exposes the formal checker command", () => {
    expect(packageJson.scripts["check:booking-platform-fee-debt-flow"]).toBe(
      "tsx scripts/check-booking-platform-fee-debt-flow.ts"
    );
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("guards local non-production data and marker-owned cleanup", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("assertSafeLocalDatabase");
    expect(source).toContain("booking-platform-fee-debt-${Date.now()}-${process.pid}");
    expect(source).toContain("cleanupMarkerFixture");
    expect(source).toContain("assertMarkerOwnership");
    expect(source).toContain("baselineAfterCleanup");
    expect(source).toContain("assertExactBaseline");
    expect(source).toContain("BARRIER_TIMEOUT_MS");
    expect(source).toContain("waitForBarrier");
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("captureBaselineOrDisconnect");
    expect(source).not.toContain("prisma.wallet.update");
    expect(source).not.toContain("prisma.wallet.updateMany");
  });

  it.each([
    "disabled policy zero mutation",
    "shop payer snapshot",
    "technician payer snapshot",
    "insufficient first-attempt rollback",
    "explicit negative balance",
    "cancellation reversal",
    "immediate reward",
    "delayed reward after approved top-up",
    "expired reward",
    "idempotent replay"
  ])("contains the %s acceptance invariant", (invariant) => {
    expect(readFileSync(scriptPath, "utf8")).toContain(invariant);
  });

  it("exercises formal services and repositories for mutations", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("new LedgerRepository(prisma)");
    expect(source).toContain("new LedgerService(");
    expect(source).toContain("new FeeCalculationService(");
    expect(source).toContain("new PlatformFeePolicyService(");
    expect(source).toContain("createWalletAdjustmentRequest(");
    expect(source).toContain("reviewWalletAdjustmentRequest(");
    expect(source).toContain("new BookingUserRewardExpiryService(");
  });

  it("uses the canonical platform fee confirmation error code", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain('import { ERROR_CODES } from "../src/constants/error-codes";');
    expect(source).toContain(
      "warning.code === ERROR_CODES.PLATFORM_FEE_INSUFFICIENT_CONFIRMATION_REQUIRED"
    );
    expect(source).not.toContain("warning.code === 40935");
  });
});
