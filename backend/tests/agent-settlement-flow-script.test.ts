import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertPersistedSettlementEvidenceUnchanged,
  assertSettlementSnapshotUnchanged,
  expectedSettlementEvidence
} from "../scripts/check-agent-settlement-flow";

const backendRoot = resolve(__dirname, "..");
const scriptPath = resolve(backendRoot, "scripts/check-agent-settlement-flow.ts");
const runnerPath = resolve(backendRoot, "scripts/check-agent-settlement-flow-runner.ts");

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

  it("validates the formal environment before loading Prisma or the flow runner", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("loadAndValidateFormalEnvironment(process.env)");
    expect(source).toContain('import("../src/prisma/client")');
    expect(source).toContain('import("./check-agent-settlement-flow-runner")');
    expect(source).not.toMatch(/^import .*from "\.\.\/src\//m);
    expect(source.indexOf("loadAndValidateFormalEnvironment(process.env)")).toBeLessThan(
      source.indexOf('import("../src/prisma/client")')
    );
  });

  it("covers nonzero financial evidence and all published allocation modes", () => {
    expect(existsSync(runnerPath)).toBe(true);
    const source = readFileSync(runnerPath, "utf8");

    for (const term of [
      "orderPlatformFeesJpy",
      "saasFeesJpy",
      "userRebatesJpy",
      "refundsAndReversalsJpy",
      "channelFeesJpy",
      "consumptionTaxJpy",
      "allocatedOperatingCostsJpy",
      "equal_active_shops",
      "platform_income_proportional",
      "direct_shops",
      "createFinancialEvidence",
      "saasPayment.create",
      "publishCost",
      "confirmSettlement",
      "markPaid",
      "captureImmutableSettlementEvidence",
      "calculationSnapshotJson",
      "ruleVersionId"
    ]) {
      expect(source).toContain(term);
    }
    expect(source.match(/costService\.publishCost\(/g)).toHaveLength(1);
    expect(source).toContain("for (const definition of costDefinitions)");
    expect(source).toContain("orderPlatformFeesJpy: 12_000");
    expect(source).toContain("saasFeesJpy: 3_000");
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

  it("detects nested persisted snapshot, rule, and line mutations", () => {
    const before = {
      ruleVersionId: 17,
      calculationSnapshotJson: {
        formula: { platformIncomeJpy: 12_000, deductionsJpy: 1_000 }
      },
      ruleVersion: { version: 3, paymentMethod: "BANK_TRANSFER" },
      lines: [
        {
          lineType: "PROFIT_SHARE",
          amountJpy: 1_100,
          calculationSnapshotJson: { profitShareRateBps: 1_000 }
        }
      ]
    };

    expect(() =>
      assertPersistedSettlementEvidenceUnchanged(before, structuredClone(before))
    ).not.toThrow();
    expect(() =>
      assertPersistedSettlementEvidenceUnchanged(before, {
        ...before,
        calculationSnapshotJson: {
          formula: { platformIncomeJpy: 12_001, deductionsJpy: 1_000 }
        }
      })
    ).toThrow("Confirmed agent settlement snapshot changed");
    expect(() =>
      assertPersistedSettlementEvidenceUnchanged(before, {
        ...before,
        lines: [{ ...before.lines[0], amountJpy: 1_101 }]
      })
    ).toThrow("Confirmed agent settlement snapshot changed");
  });
});
