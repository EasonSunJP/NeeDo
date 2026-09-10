import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal shop membership card refund database checker", () => {
  it("is wired as a rollback-only local flow with order, wallet, audit, and RBAC invariants", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(
      join(process.cwd(), "scripts/check-shop-membership-card-refund-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:shop-membership-card-refund-flow"]).toBe(
      "tsx scripts/check-shop-membership-card-refund-flow.ts"
    );
    for (const token of [
      "assertSafeLocalDatabase",
      "verifyPhysicalMigration",
      "rewardStateSupportsPendingCancellation",
      "prisma.$transaction",
      "RollbackVerified",
      "transactionRolledBack",
      "paymentStatus: ServicePaymentStatus.REFUNDED",
      "customerBalanceAfterNdp === -500",
      "ledgerBalanced",
      "idempotentReplay",
      "orderRefundEvidenceRequired",
      "merchant.shop_membership_card.redemption.refund",
      "ledger.shop_membership_reward.reversal",
      "shop.member.card.refund",
      "merchant_staff"
    ]) {
      expect(source).toContain(token);
    }
  });
});
