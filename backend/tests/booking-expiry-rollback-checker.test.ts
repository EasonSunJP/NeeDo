import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("booking expiry rollback checker contract", () => {
  const checkerPath = resolve(__dirname, "../scripts/check-booking-expiry-rollback.ts");

  it("provides a guarded independent-connection rollback checker", () => {
    expect(existsSync(checkerPath)).toBe(true);
    const source = readFileSync(checkerPath, "utf8");
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["check:booking-expiry-rollback"]).toBe(
      "tsx scripts/check-booking-expiry-rollback.ts"
    );
    expect(source).toContain("loadAndValidateFormalEnvironment");
    expect(source).toContain("createPrismaClient");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("SHOW FULL PROCESSLIST");
    expect(source).toContain("BookingRepository");
    expect(source).toContain("targetStartsAt.getTime() + 250");
    expect(source).toContain("affiliateAttribution");
    expect(source).toContain("PASS booking expiry replacement rolled back without residue");
  });

  it("cleans marker rows and disconnects every client when the lock transaction rejects before readiness", async () => {
    const checker = await import("../scripts/check-booking-expiry-rollback") as Partial<{
      awaitOldSlotLockOrThrow: (
        oldSlotLocked: Promise<void>,
        lockTransaction: Promise<unknown>
      ) => Promise<void>;
      runBookingExpiryRollbackLifecycle: (dependencies: {
        execute: () => Promise<void>;
        settle: () => Promise<void>;
        cleanupMarker: () => Promise<void>;
        disconnectClients: readonly (() => Promise<void>)[];
      }) => Promise<void>;
    }>;

    if (!checker.awaitOldSlotLockOrThrow || !checker.runBookingExpiryRollbackLifecycle) {
      throw new Error("booking expiry rollback lifecycle seam is missing");
    }

    const lockFailure = new Error("lock transaction failed before FOR UPDATE");
    const markerCleanup = jest.fn(async () => undefined);
    const settle = jest.fn(async () => undefined);
    const disconnectClients = Array.from({ length: 4 }, () => jest.fn(async () => undefined));
    let continuedAfterLock = false;

    await expect(checker.runBookingExpiryRollbackLifecycle({
      execute: async () => {
        await checker.awaitOldSlotLockOrThrow!(
          new Promise<void>(() => undefined),
          Promise.reject(lockFailure)
        );
        continuedAfterLock = true;
      },
      settle,
      cleanupMarker: markerCleanup,
      disconnectClients
    })).rejects.toBe(lockFailure);

    expect(continuedAfterLock).toBe(false);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(markerCleanup).toHaveBeenCalledTimes(1);
    for (const disconnect of disconnectClients) expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
