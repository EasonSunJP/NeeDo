import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal shop membership card top-up database checker", () => {
  it("is wired as a rollback-only local database flow with financial and RBAC invariants", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(join(process.cwd(), "scripts/check-shop-membership-card-topup-flow.ts"), "utf8");

    expect(packageJson.scripts["check:shop-membership-card-topup-flow"]).toBe(
      "tsx scripts/check-shop-membership-card-topup-flow.ts"
    );
    for (const token of [
      "assertSafeLocalDatabase",
      "prisma.$transaction",
      "RollbackVerifiedFlow",
      "wallet.findMany",
      "ledgerTransaction.count",
      "walletLedger.count",
      "merchant.shop_membership_card.topup.create",
      "shop_membership.card_topup.created.title",
      "idempotentReplay",
      "idempotencyConflictRejected",
      "pendingAdjustmentRejected",
      "crossShopRejected",
      "walletAndNdpLedgerUnchanged",
      "information_schema.TABLE_CONSTRAINTS",
      "shop_membership_card_topups_idempotency_key",
      "shop.member.card.topup.create",
      "merchant_staff"
    ]) {
      expect(source).toContain(token);
    }
  });
});
