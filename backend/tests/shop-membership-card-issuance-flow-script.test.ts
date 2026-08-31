import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal shop membership card issuance database checker", () => {
  it("is wired as a rollback-only local database flow", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(
      join(process.cwd(), "scripts/check-shop-membership-card-issuance-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:shop-membership-card-issuance-flow"]).toBe(
      "tsx scripts/check-shop-membership-card-issuance-flow.ts"
    );
    expect(source).toContain("assertSafeLocalDatabase");
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain("RollbackVerifiedFlow");
    expect(source).toContain("wallet.findMany");
    expect(source).toContain("ledgerTransaction.count");
    expect(source).toContain("walletLedger.count");
    expect(source).toContain("merchant.shop_membership_card.issue");
    expect(source).toContain("shop_membership.card_issued.title");
    expect(source).toContain("idempotencyConflictRejected");
    expect(source).toContain("information_schema.TABLE_CONSTRAINTS");
    expect(source).toContain("shop_membership_cards_issuance_idempotency_key");
    expect(source).toContain("shop.member.card.issue");
    expect(source).toContain("merchant_staff");
  });
});
