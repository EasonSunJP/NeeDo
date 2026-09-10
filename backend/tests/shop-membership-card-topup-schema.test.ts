import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260901040000_shop_membership_card_topup/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("shop membership card top-up schema contract", () => {
  it("persists immutable top-up evidence and authoritative principal snapshots", () => {
    for (const token of [
      "enum ShopMembershipCardTopUpPaymentMethod",
      "CASH",
      "CARD",
      "PAYPAY",
      "BANK_TRANSFER",
      "OTHER",
      "model ShopMembershipCardTopUp",
      "amountJpy",
      "paymentMethod",
      "paymentReference",
      "principalBalanceBeforeJpy",
      "principalBalanceAfterJpy",
      "cardLockVersionBefore",
      "idempotencyKey",
      "requestFingerprint",
      "topUps"
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).toMatch(
      /idempotencyKey\s+String\s+@unique\(map: "shop_membership_card_topups_idempotency_key"\)/
    );
  });

  it("ships an additive constrained migration without NDP wallet mutations", () => {
    expect(migration).toContain("CREATE TABLE `shop_membership_card_topups`");
    expect(migration).toContain("CHECK (`amount_jpy` > 0)");
    expect(migration).toContain(
      "`principal_balance_after_jpy` = `principal_balance_before_jpy` + `amount_jpy`"
    );
    expect(migration).toContain("shop_membership_card_topups_card_id_fkey");
    expect(migration).toContain("shop_membership_card_topups_shop_id_fkey");
    expect(migration).toContain("shop_membership_card_topups_created_by_id_fkey");
    expect(migration).not.toMatch(/UPDATE\s+`?(wallets|ledger_transactions|wallet_ledgers)/i);
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+`?(wallets|ledger_transactions|wallet_ledgers)/i
    );
  });

  it("grants top-up creation to admins and merchant owners but not staff", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain("shop.member.card.topup.create");
    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toContain("shop.member.card.topup.create");
    expect(assignments.merchant_owner).toContain("shop.member.card.topup.create");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.topup.create");
    expect(migration).toContain("'shop.member.card.topup.create'");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'merchant_owner')");
  });
});
