import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260831170000_shop_membership_card_adjustment_approval/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("shop membership card adjustment approval schema contract", () => {
  it("persists the six-state approval workflow and immutable before/target snapshots", () => {
    for (const token of [
      "enum ShopMembershipCardAdjustmentStatus",
      "PENDING",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
      "EXPIRED",
      "INVALIDATED",
      "model ShopMembershipCardAdjustmentRequest",
      "pendingKey",
      "beforePrincipalBalanceJpy",
      "targetPrincipalBalanceJpy",
      "beforeRemainingUses",
      "targetRemainingUses",
      "cardLockVersionBefore",
      "requestIdempotencyKey",
      "requestFingerprint",
      "decisionIdempotencyKey",
      "decisionFingerprint",
      "expiresAt",
      "decidedAt",
      "cancelledAt",
      "invalidatedAt"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toMatch(/pendingKey\s+String\?\s+@unique\(map: "shop_membership_card_adjustments_pending_key"\)/);
    expect(schema).toMatch(/lockVersion\s+Int\s+@default\(1\) @map\("lock_version"\)/);
  });

  it("ships an additive migration with relational and range constraints", () => {
    expect(migration).toContain("CREATE TABLE `shop_membership_card_adjustment_requests`");
    expect(migration).toContain("ADD COLUMN `lock_version` INTEGER NOT NULL DEFAULT 1");
    expect(migration).toContain("shop_membership_card_adjustments_pending_key");
    expect(migration).toContain("shop_membership_card_adjustments_request_idempotency_key");
    expect(migration).toContain("shop_membership_card_adjustments_decision_idempotency_key");
    expect(migration).toContain("shop_membership_card_adjustments_card_id_fkey");
    expect(migration).toContain("shop_membership_card_adjustments_shop_id_fkey");
    expect(migration).toContain("shop_membership_card_adjustments_requested_by_id_fkey");
    expect(migration).toContain("shop_membership_card_adjustments_decided_by_id_fkey");
    expect(migration).toContain("shop_membership_card_adjustments_cancelled_by_id_fkey");
    expect(migration).toContain("CHECK");
    expect(migration).not.toMatch(/UPDATE\s+`?(wallets|ledger_transactions)/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+`?(wallets|ledger_transactions)/i);
  });

  it("grants adjustment requests to admins and merchant owners but not staff by default", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain("shop.member.card.adjust.request");
    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toContain("shop.member.card.adjust.request");
    expect(assignments.merchant_owner).toContain("shop.member.card.adjust.request");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.adjust.request");
    expect(migration).toContain("'shop.member.card.adjust.request'");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'merchant_owner')");
  });
});
