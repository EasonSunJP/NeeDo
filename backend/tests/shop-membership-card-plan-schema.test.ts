import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260831150000_shop_membership_card_rule_configuration/migration.sql"
);
const utcCorrectionMigrationPath = join(
  process.cwd(),
  "prisma/migrations/20260831151000_membership_reward_fee_policy_utc_bootstrap/migration.sql"
);

const planPermissions = [
  "shop.member.card_plan.view",
  "shop.member.card_plan.manage",
  "shop.member.card_plan.publish"
] as const;

const operationsPermissions = [
  "page:backoffice-membership-reward-fee",
  "button:backoffice-membership-reward-fee-create"
] as const;

describe("shop membership card plan schema contract", () => {
  it("defines versioned fee, plan, draft, and typed NDP reward persistence", () => {
    for (const token of [
      "enum MembershipRewardFeePolicyStatus",
      "enum ShopMembershipCardPlanStatus",
      "enum ShopMembershipCardPlanVersionStatus",
      "enum ShopMembershipCardPlanValidityMode",
      "enum ShopMembershipRewardRuleGroup",
      "enum ShopMembershipRewardRuleKind",
      "FIXED_PER_COMPLETION",
      "PERCENT_OF_ELIGIBLE_AMOUNT",
      "SPEND_BLOCK",
      "FIRST_CARD_USE_BONUS",
      "SERVICE_SCOPE_BONUS",
      "COMPLETION_MILESTONE_BONUS",
      "SPEND_MILESTONE_BONUS",
      "BIRTHDAY_MONTH_BONUS",
      "SCHEDULE_WINDOW_BONUS",
      "CONSECUTIVE_MONTH_BONUS",
      "model MembershipRewardFeePolicyVersion",
      "model ShopMembershipCardPlan",
      "model ShopMembershipCardPlanVersion",
      "model ShopMembershipRewardRule",
      "platformFeeRateBps",
      "rewardCaps",
      "draftKey"
    ]) {
      expect(schema).toContain(token);
    }

    for (const modelName of [
      "MembershipRewardFeePolicyVersion",
      "ShopMembershipCardPlan",
      "ShopMembershipCardPlanVersion",
      "ShopMembershipRewardRule"
    ]) {
      const model = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`))?.[1];
      expect(model).toContain("id");
      expect(model).toContain("createdAt");
      expect(model).toContain("updatedAt");
      expect(model).toContain("deletedAt");
    }
  });

  it("ships one additive migration with an idempotent 10 percent initial fee", () => {
    const migration = readFileSync(migrationPath, "utf8");
    for (const table of [
      "membership_reward_fee_policy_versions",
      "shop_membership_card_plans",
      "shop_membership_card_plan_versions",
      "shop_membership_reward_rules"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(migration).toContain("`fee_rate_bps` INTEGER NOT NULL");
    expect(migration).toContain("CHECK (`fee_rate_bps` BETWEEN 0 AND 10000)");
    expect(migration).toContain("'membership_reward'");
    expect(migration).toContain("1000");
    expect(migration).not.toMatch(/UPDATE\s+`?(wallets|ledger_entries|shop_membership_cards)`?/i);
  });

  it("normalizes the initial fee policy against UTC without rewriting migration history", () => {
    const correction = readFileSync(utcCorrectionMigrationPath, "utf8");
    expect(correction).toContain("UTC_TIMESTAMP(3)");
    expect(correction).toContain("`version` = 1");
    expect(correction).toContain("Initial membership reward platform fee");
    expect(correction).not.toMatch(
      /UPDATE\s+`?(wallets|wallet_ledger|ledger_transactions|shop_membership_cards)`?/i
    );
  });

  it("grants read-only plans to staff, full plan control to owners, and fee writes to finance", () => {
    expect(SYSTEM_PERMISSION_CODES).toEqual(
      expect.arrayContaining([...planPermissions, ...operationsPermissions])
    );
    const assignments = buildRolePermissionAssignments();
    expect(assignments.merchant_owner).toEqual(expect.arrayContaining(planPermissions));
    expect(assignments.merchant_staff).toContain("shop.member.card_plan.view");
    expect(assignments.merchant_staff).not.toContain("shop.member.card_plan.manage");
    expect(assignments.merchant_staff).not.toContain("shop.member.card_plan.publish");
    expect(assignments.operator).toContain("page:backoffice-membership-reward-fee");
    expect(assignments.operator).not.toContain("button:backoffice-membership-reward-fee-create");
    expect(assignments.finance).toEqual(expect.arrayContaining(operationsPermissions));
  });
});
