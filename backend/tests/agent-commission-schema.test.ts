import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

describe("agent commission and operating cost schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260902110000_agent_commission_operating_cost/migration.sql"
  );
  const permissionMigrationPath = join(
    process.cwd(),
    "prisma/migrations/20260903090000_agent_operating_cost_permissions/migration.sql"
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

  it("deploys agent and operating-cost RBAC without requiring a seed rerun", () => {
    expect(existsSync(permissionMigrationPath)).toBe(true);
    const migration = existsSync(permissionMigrationPath)
      ? readFileSync(permissionMigrationPath, "utf8")
      : "";
    const permissions = [
      "backoffice:partner-profile:write",
      "backoffice:agent:read",
      "backoffice:agent:write",
      "backoffice:operating-cost:read",
      "backoffice:operating-cost:write",
      "backoffice:agent-settlement:read",
      "backoffice:agent-settlement:write",
      "backoffice:agent-settlement:pay"
    ] as const;

    for (const permission of permissions) {
      expect(SYSTEM_PERMISSION_CODES).toContain(permission);
      expect(migration).toContain(`'${permission}'`);
    }
    for (const role of ["admin", "operator", "finance", "viewer"] as const) {
      expect(migration).toContain(`WHERE \`roles\`.\`code\` = '${role}'`);
    }
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");

    const assignments = buildRolePermissionAssignments();
    expect(assignments.operator).not.toContain("backoffice:agent-settlement:pay");
    expect(assignments.finance).toEqual(
      expect.arrayContaining([
        "backoffice:operating-cost:read",
        "backoffice:operating-cost:write",
        "backoffice:agent-settlement:read",
        "backoffice:agent-settlement:pay"
      ])
    );
    expect(assignments.viewer).toEqual(
      expect.arrayContaining([
        "backoffice:agent:read",
        "backoffice:operating-cost:read",
        "backoffice:agent-settlement:read"
      ])
    );
  });
});
