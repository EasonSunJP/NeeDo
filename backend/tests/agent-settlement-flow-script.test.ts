import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertSettlementSnapshotUnchanged,
  expectedSettlementEvidence
} from "../scripts/check-agent-settlement-flow";

const backendRoot = resolve(__dirname, "..");
const scriptPath = resolve(backendRoot, "scripts/check-agent-settlement-flow.ts");

describe("rollback-only agent settlement flow checker", () => {
  it("is wired as the explicit package command", () => {
    const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:agent-settlement"]).toBe(
      "tsx scripts/check-agent-settlement-flow.ts"
    );
  });

  it("covers every financial fact and allocation mode inside a rollback-only transaction", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("runRollbackOnlyTransaction");
    expect(source).toContain("ROLLBACK");
    for (const term of [
      "orderPlatformFeesJpy",
      "saasFeesJpy",
      "userRebatesJpy",
      "allocatedOperatingCostsJpy",
      "equal_active_shops",
      "platform_income_proportional",
      "direct_shops",
      "confirmSettlement",
      "markPaid"
    ]) {
      expect(source).toContain(term);
    }
  });

  it("pins the confirmed accounting snapshot even after configuration changes", () => {
    const snapshot = expectedSettlementEvidence({
      orderPlatformFeesJpy: 10_000,
      saasFeesJpy: 2_000,
      userRebatesJpy: 500,
      refundsAndReversalsJpy: 100,
      channelFeesJpy: 200,
      consumptionTaxJpy: 300,
      allocatedOperatingCostsJpy: 900,
      fixedSuccessRewardJpy: 1_000,
      profitShareRateBps: 1_000
    });

    expect(snapshot).toMatchObject({
      pureProfitJpy: 10_000,
      profitShareAmountJpy: 1_000,
      totalAmountJpy: 2_000
    });
    expect(() => assertSettlementSnapshotUnchanged(snapshot, { ...snapshot })).not.toThrow();
    expect(() =>
      assertSettlementSnapshotUnchanged(snapshot, { ...snapshot, totalAmountJpy: 2_001 })
    ).toThrow("Confirmed agent settlement snapshot changed");
  });
});
