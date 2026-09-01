import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260901050000_shop_membership_card_redemption/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("shop membership card redemption schema contract", () => {
  it("persists immutable order, card-consumption, reward, and settlement evidence", () => {
    for (const token of [
      "enum ShopMembershipCardRedemptionStatus",
      "APPLIED",
      "REFUNDED",
      "enum ShopMembershipCardRewardStatus",
      "NONE",
      "PENDING_FUNDS",
      "PAID",
      "REVERSED",
      "model ShopMembershipCardRedemption",
      "bookingOrderId",
      "planVersionId",
      "redeemedById",
      "servicePublicId",
      "eligibleAmountJpy",
      "consumedPrincipalJpy",
      "consumedUses",
      "principalBalanceBeforeJpy",
      "principalBalanceAfterJpy",
      "remainingUsesBefore",
      "remainingUsesAfter",
      "rewardFacts",
      "rewardHits",
      "customerRewardNdp",
      "platformFeeRateBps",
      "platformFeeNdp",
      "totalShopDebitNdp",
      "outstandingRewardNdp",
      "ledgerTransactionId",
      "idempotencyKey",
      "requestFingerprint",
      "redemptions"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toMatch(
      /bookingOrderId\s+Int\s+@unique\(map: "shop_membership_card_redemptions_booking_order_id_key"\)/
    );
  });

  it("ships additive constraints that forbid partial rewards and preserve card arithmetic", () => {
    expect(migration).toContain("CREATE TABLE `shop_membership_card_redemptions`");
    expect(migration).toContain("shop_membership_card_redemptions_booking_order_id_key");
    expect(migration).toContain("`consumed_principal_jpy` >= 0 AND `consumed_uses` >= 0");
    expect(migration).toContain(
      "`principal_balance_after_jpy` = `principal_balance_before_jpy` - `consumed_principal_jpy`"
    );
    expect(migration).toContain(
      "`remaining_uses_after` = `remaining_uses_before` - `consumed_uses`"
    );
    expect(migration).toContain(
      "`total_shop_debit_ndp` = `customer_reward_ndp` + `platform_fee_ndp`"
    );
    expect(migration).toContain(
      "(`reward_status` = 'pending_funds' AND `outstanding_reward_ndp` = `total_shop_debit_ndp`"
    );
    expect(migration).toContain(
      "(`reward_status` = 'paid' AND `outstanding_reward_ndp` = 0 AND `ledger_transaction_id` IS NOT NULL"
    );
    expect(migration).toContain("shop_membership_card_redemptions_card_id_fkey");
    expect(migration).toContain("shop_membership_card_redemptions_booking_order_id_fkey");
    expect(migration).toContain("shop_membership_card_redemptions_ledger_transaction_id_fkey");
  });

  it("grants redemption to owners and staff without broadening card-management authority", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain("shop.member.card.redeem");
    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toContain("shop.member.card.redeem");
    expect(assignments.merchant_owner).toContain("shop.member.card.redeem");
    expect(assignments.merchant_staff).toContain("shop.member.card.redeem");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.issue");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.topup.create");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.adjust.request");
    expect(migration).toContain("'shop.member.card.redeem'");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff')");
  });
});
