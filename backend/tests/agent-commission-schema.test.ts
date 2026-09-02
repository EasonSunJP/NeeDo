import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("agent commission and operating cost schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260902110000_agent_commission_operating_cost/migration.sql"
  );

  it("defines user-backed partner, referral and versioned rule records", () => {
    for (const token of [
      "enum PlatformPartnerType",
      "enum AgentPaymentMethod",
      "model PlatformPartnerProfile",
      "model AgentShopReferral",
      "model AgentCommissionRuleVersion",
      "fixedSuccessRewardJpy",
      "profitShareRateBps",
      "effectiveFrom",
      "effectiveTo"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toContain('@relation("PlatformPartnerProfileUser"');
    expect(schema).toContain('@relation("PlatformPartnerProfileMarker"');
    expect(schema).toContain("activePartnerKey");
    expect(schema).toContain("activeShopKey");
    expect(schema).toContain("@@unique([agentProfileId, version]");
  });

  it("defines auditable cost allocation and immutable settlement snapshots", () => {
    for (const token of [
      "enum OperatingCostAllocationMode",
      "enum OperatingCostStatus",
      "enum AgentSettlementStatus",
      "enum AgentSettlementLineType",
      "model OperatingCostItem",
      "model OperatingCostAllocation",
      "model AgentSettlement",
      "model AgentSettlementLine",
      "calculationSnapshotJson",
      "allocatedOperatingCostsJpy",
      "orderPlatformFeesJpy",
      "saasFeesJpy",
      "userRebatesJpy",
      "refundsAndReversalsJpy",
      "channelFeesJpy",
      "consumptionTaxJpy"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toContain("@@unique([agentProfileId, periodStart, periodEnd]");
    expect(schema).toContain("@@unique([settlementId, referralId, lineType]");
  });

  it("ships an additive migration with bounds, windows and restrictive foreign keys", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

    for (const table of [
      "platform_partner_profiles",
      "agent_shop_referrals",
      "agent_commission_rule_versions",
      "operating_cost_items",
      "operating_cost_allocations",
      "agent_settlements",
      "agent_settlement_lines"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(migration).toContain("agent_commission_rule_versions_rate_chk");
    expect(migration).toContain("agent_commission_rule_versions_window_chk");
    expect(migration).toContain("operating_cost_items_period_chk");
    expect(migration).toContain("agent_settlements_period_chk");
    expect(migration).toContain("ON DELETE RESTRICT");
  });
});
