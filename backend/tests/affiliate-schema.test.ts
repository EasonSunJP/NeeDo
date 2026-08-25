import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate schema foundation", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  const models = [
    "AffiliateTask",
    "AffiliateTaskShop",
    "AffiliateTaskService",
    "AffiliateClaim",
    "AffiliateTouch",
    "AffiliateAttribution",
    "AffiliateReward",
    "AffiliateRewardTransaction",
    "AffiliateBudgetReservation",
    "AffiliateBudgetTransaction",
    "AffiliateRiskEvent"
  ];

  it.each(models)("defines %s with the shared soft-delete columns", (name) => {
    const block = modelBlock(name);
    expect(block).toMatch(/id\s+Int\s+@id/);
    expect(block).toContain("createdAt");
    expect(block).toContain("updatedAt");
    expect(block).toContain("deletedAt");
  });

  it("extends the existing wallet and ledger enums without changing their mapped values", () => {
    expect(schema).toMatch(
      /enum WalletOwnerType[\s\S]*MERCHANT_ACCOUNT\s+@map\("merchant_account"\)/
    );
    expect(schema).toMatch(
      /enum WalletLedgerDirection[\s\S]*FROZEN_CREDIT\s+@map\("frozen_credit"\)/
    );
    expect(schema).toContain("AFFILIATE_TASK_BUDGET_FREEZE");
    expect(schema).toContain("AFFILIATE_TASK_BUDGET_RELEASE");
    expect(schema).toContain("AFFILIATE_REWARD_SETTLEMENT");
    expect(schema).toContain("AFFILIATE_REWARD_REVERSAL");
    expect(schema).toContain("AFFILIATE_REWARD_RECOVERY");
  });

  it("uses active-key uniqueness for soft-deletable claim and attribution exclusivity", () => {
    expect(modelBlock("AffiliateClaim")).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(modelBlock("AffiliateAttribution")).toMatch(/activeKey\s+String\?\s+@unique/);
  });

  it("links one task budget reservation and enforces one active order attribution", () => {
    expect(modelBlock("AffiliateBudgetReservation")).toMatch(/taskId\s+Int\s+@unique/);
    expect(modelBlock("AffiliateAttribution")).toMatch(/bookingOrderId\s+Int/);
    expect(modelBlock("AffiliateAttribution")).toMatch(/@@index\(\[bookingOrderId/);
  });

  it("ships the new migration", () => {
    expect(
      existsSync(
        join(
          process.cwd(),
          "prisma/migrations/20260826090000_affiliate_domain_foundation/migration.sql"
        )
      )
    ).toBe(true);
  });
});
