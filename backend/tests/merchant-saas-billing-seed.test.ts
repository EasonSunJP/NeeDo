import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("merchant SaaS billing seed contract", () => {
  const seed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");

  it("seeds an idempotent merchant group with billing records", () => {
    expect(seed).toContain("seedMerchantSaasBillingData");
    expect(seed).toContain('code: "seed-tokyo-wellness-group"');
    expect(seed).toContain("tx.merchantShopMembership.upsert");
    expect(seed).toContain("tx.saasBillingProfile.upsert");
    expect(seed).toContain("tx.saasFreePeriod.upsert");
    expect(seed).toContain("tx.saasInvoice.upsert");
    expect(seed).toContain("tx.saasInvoiceLine.upsert");
  });
});
