import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertPersistedSettlementEvidenceUnchanged,
  assertSettlementSnapshotUnchanged,
  expectedSettlementEvidence,
  loadValidatedSettlementCheckModules
} from "../scripts/check-agent-settlement-flow";
import {
  assertAllocationEvidence,
  type AllocationEvidenceRow
} from "../scripts/check-agent-settlement-flow-runner";

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

  it("creates the rollback shop identifier with the canonical shop prefix", () => {
    const runnerSource = readFileSync(runnerPath, "utf8");

    expect(runnerSource).toContain('publicId: `shop${numericSuffix}`');
    expect(runnerSource).not.toContain('publicId: `S${numericSuffix}`');
  });

  it("preserves the unique active exchange-rate sentinel inside the rollback transaction", () => {
    const runnerSource = readFileSync(runnerPath, "utf8");

    expect(runnerSource).toContain(
      'data: { status: "SUPERSEDED", activeKey: null, effectiveTo: rateEffectiveFrom }'
    );
    expect(runnerSource).toContain('activeKey: "ndp_exchange_rate"');
  });

  it("temporarily supplies canonical identifiers for legacy published shops", () => {
    const runnerSource = readFileSync(runnerPath, "utf8");

    expect(runnerSource).toContain("const publishedShops = await transaction.shop.findMany");
    expect(runnerSource).toContain("if (!publishedShop.publicIdentifier)");
    expect(runnerSource).toContain("shopId: publishedShop.id");
  });

  it("validates the formal environment before loading Prisma or the flow runner", async () => {
    const calls: string[] = [];
    const runtimeEnvironment: NodeJS.ProcessEnv = {};
    const modules = await loadValidatedSettlementCheckModules(runtimeEnvironment, {
      validateEnvironment: () => {
        calls.push("validate");
        return { values: { DATABASE_URL: "mysql://validated" } };
      },
      loadPrismaModule: async () => {
        calls.push(`prisma:${runtimeEnvironment.DATABASE_URL}`);
        return { module: "prisma" };
      },
      loadFlowModule: async () => {
        calls.push(`flow:${runtimeEnvironment.DATABASE_URL}`);
        return { module: "flow" };
      }
    });

    expect(calls).toEqual(["validate", "prisma:mysql://validated", "flow:mysql://validated"]);
    expect(modules).toEqual([{ module: "prisma" }, { module: "flow" }]);

    const blockedLoaders = jest.fn();
    await expect(
      loadValidatedSettlementCheckModules({}, {
        validateEnvironment: () => {
          throw new Error("formal environment rejected");
        },
        loadPrismaModule: blockedLoaders,
        loadFlowModule: blockedLoaders
      })
    ).rejects.toThrow("formal environment rejected");
    expect(blockedLoaders).not.toHaveBeenCalled();
  });

  it("checks equal, proportional, and direct allocation evidence structurally", () => {
    const row = (
      shopId: number,
      amountJpy: number,
      allocationMode: string,
      extra: Record<string, unknown> = {}
    ): AllocationEvidenceRow => ({
      shopId,
      amountJpy: BigInt(amountJpy),
      calculationSnapshotJson: {
        allocationMode,
        costAmountJpy:
          allocationMode === "equal_active_shops"
            ? 1_001
            : allocationMode === "platform_income_proportional"
              ? 1_103
              : 907,
        allocatedAmountJpy: amountJpy,
        remainderPolicy: "shop_numeric_id_ascending",
        ...extra
      }
    });

    assertAllocationEvidence(
      [row(10, 501, "equal_active_shops"), row(20, 500, "equal_active_shops")],
      "equal_active_shops",
      1_001
    );
    assertAllocationEvidence(
      [
        row(10, 883, "platform_income_proportional", {
          settledPlatformIncomeJpy: 12_000,
          totalBasisJpy: 15_000
        }),
        row(20, 220, "platform_income_proportional", {
          settledPlatformIncomeJpy: 3_000,
          totalBasisJpy: 15_000
        })
      ],
      "platform_income_proportional",
      1_103
    );
    assertAllocationEvidence([row(10, 907, "direct_shops")], "direct_shops", 907, 10);
    expect(() =>
      assertAllocationEvidence([row(20, 907, "direct_shops")], "direct_shops", 907, 10)
    ).toThrow();
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
    const persistedSettlement = { ...snapshot, publicId: "settlement-record" };
    expect(() =>
      assertSettlementSnapshotUnchanged(snapshot, persistedSettlement)
    ).not.toThrow();
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
    expect(() =>
      assertPersistedSettlementEvidenceUnchanged(before, {
        ...before,
        ruleVersion: { ...before.ruleVersion, paymentMethod: "MANUAL" }
      })
    ).toThrow("Confirmed agent settlement snapshot changed");
  });
});
