import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260901200000_shop_membership_card_refund/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("shop membership card refund schema contract", () => {
  it("persists immutable card restoration, order refund, and reward reversal evidence", () => {
    for (const token of [
      "enum ShopMembershipCardRefundStatus",
      "enum ShopMembershipRewardReversalMode",
      "CANCELLED_PENDING",
      "LEDGER_REVERSED",
      "model ShopMembershipCardRedemptionRefund",
      "redemptionId",
      "bookingOrderId",
      "customerUserId",
      "refundedById",
      "orderPaymentRefundedAt",
      "orderPaymentRefundReference",
      "restoredPrincipalJpy",
      "restoredUses",
      "principalBalanceBeforeJpy",
      "principalBalanceAfterJpy",
      "remainingUsesBefore",
      "remainingUsesAfter",
      "rewardStatusBefore",
      "reversalMode",
      "customerRewardReversedNdp",
      "platformFeeReversedNdp",
      "totalShopCreditNdp",
      "customerBalanceBeforeNdp",
      "customerBalanceAfterNdp",
      "reversalLedgerTransactionId",
      "idempotencyKey",
      "requestFingerprint",
      "refund"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toContain("SHOP_MEMBERSHIP_REWARD_REVERSAL");
    expect(schema).toMatch(
      /redemptionId\s+Int\s+@unique\(map: "shop_membership_card_redemption_refunds_redemption_id_key"\)/
    );
  });

  it("ships additive constraints, indexes, and restrictive foreign keys", () => {
    expect(migration).toContain("CREATE TABLE `shop_membership_card_redemption_refunds`");
    expect(migration).toContain("shop_membership_card_redemption_refunds_redemption_id_key");
    expect(migration).toContain(
      "`principal_balance_after_jpy` = `principal_balance_before_jpy` + `restored_principal_jpy`"
    );
    expect(migration).toContain(
      "`remaining_uses_after` = `remaining_uses_before` + `restored_uses`"
    );
    expect(migration).toContain(
      "`total_shop_credit_ndp` = `customer_reward_reversed_ndp` + `platform_fee_reversed_ndp`"
    );
    expect(migration).toContain("`reversal_mode` = 'cancelled_pending'");
    expect(migration).toContain("`reversal_mode` = 'ledger_reversed'");
    expect(migration).toContain("`customer_balance_after_ndp` IS NOT NULL");
    expect(migration).toContain("shop_membership_card_redemption_refunds_redemption_id_fkey");
    expect(migration).toContain("shop_membership_card_redemption_refunds_card_id_fkey");
    expect(migration).toContain("shop_membership_card_redemption_refunds_booking_order_id_fkey");
    expect(migration).toContain("shop_membership_card_refund_reversal_ledger_tx_fkey");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
  });

  it("grants refund only to admin and merchant owners", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain("shop.member.card.refund");
    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toContain("shop.member.card.refund");
    expect(assignments.merchant_owner).toContain("shop.member.card.refund");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.refund");
    expect(migration).toContain("'shop.member.card.refund'");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'merchant_owner')");
  });
});
