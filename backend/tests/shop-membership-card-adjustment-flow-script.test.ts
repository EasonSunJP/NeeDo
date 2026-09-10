import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal shop membership card adjustment database checker", () => {
  it("is wired as a rollback-only local database flow with financial invariants", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(
      join(process.cwd(), "scripts/check-shop-membership-card-adjustment-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:shop-membership-card-adjustment-flow"]).toBe(
      "tsx scripts/check-shop-membership-card-adjustment-flow.ts"
    );
    expect(source).toContain("assertSafeLocalDatabase");
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain("RollbackVerifiedFlow");
    expect(source).toContain("wallet.findMany");
    expect(source).toContain("ledgerTransaction.count");
    expect(source).toContain("walletLedger.count");
    expect(source).toContain("merchant.shop_membership_card.adjustment.request");
    expect(source).toContain("customer.shop_membership_card.adjustment.approve");
    expect(source).toContain("customer.shop_membership_card.adjustment.reject");
    expect(source).toContain("system.shop_membership_card.adjustment.expire");
    expect(source).toContain("system.shop_membership_card.adjustment.invalidate");
    expect(source).toContain("idempotentReplay");
    expect(source).toContain("crossShopRejected");
    expect(source).toContain("crossCustomerRejected");
    expect(source).toContain("information_schema.TABLE_CONSTRAINTS");
    expect(source).toContain("shop_membership_card_adjustments_pending_key");
    expect(source).toContain("shop.member.card.adjust.request");
    expect(source).toContain("merchant_staff");
  });
});
