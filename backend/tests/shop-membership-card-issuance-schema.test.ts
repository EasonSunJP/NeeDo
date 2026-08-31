import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260831160000_shop_membership_card_issuance/migration.sql"),
  "utf8"
);

describe("shop membership card issuance schema contract", () => {
  it("persists formal issuance source, immutable snapshots, actor, and idempotency", () => {
    for (const token of [
      "enum ShopMembershipCardIssuanceSource",
      "OFFLINE_PAID",
      "HISTORICAL_REPLACEMENT",
      "MANUAL_GRANT",
      "planId",
      "planVersionId",
      "issuedById",
      "issuanceSource",
      "issuanceReference",
      "issuanceNote",
      "initialPrincipalJpy",
      "initialUses",
      "platformFeeRateBpsSnapshot",
      "issuanceIdempotencyKey",
      "issuanceFingerprint"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toContain('@unique(map: "shop_membership_cards_issuance_idempotency_key")');
    expect(schema).toContain('@relation("ShopMembershipCardPlanCards"');
    expect(schema).toContain('@relation("ShopMembershipCardPlanVersionCards"');
    expect(schema).toContain('@relation("ShopMembershipCardIssuedBy"');
  });

  it("ships an additive migration without touching balances, wallets, or ledgers", () => {
    expect(migration).toContain("ALTER TABLE `shop_membership_cards`");
    expect(migration).toContain("ADD COLUMN `plan_id`");
    expect(migration).toContain("ADD COLUMN `issuance_idempotency_key`");
    expect(migration).toContain("shop_membership_cards_plan_id_fkey");
    expect(migration).toContain("shop_membership_cards_plan_version_id_fkey");
    expect(migration).toContain("shop_membership_cards_issued_by_id_fkey");
    expect(migration).toContain("CREATE UNIQUE INDEX `shop_membership_cards_issuance_idempotency_key`");
    expect(migration).not.toMatch(/UPDATE\s+`?(wallets|wallet_ledger|ledger_transactions|shop_membership_cards)`?/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+`?(wallets|wallet_ledger|ledger_transactions)/i);
  });

  it("grants exact card issuance permission to merchant owners only by default", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain("shop.member.card.issue");
    const assignments = buildRolePermissionAssignments();
    expect(assignments.merchant_owner).toContain("shop.member.card.issue");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.issue");
  });
});
