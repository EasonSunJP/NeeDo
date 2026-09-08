import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pricing-mode settlement share schema", () => {
  it("clamps legacy multipliers and enforces the settlement percentage at the database boundary", () => {
    const sql = readFileSync(
      resolve(__dirname, "../prisma/migrations/20260908203000_pricing_settlement_share_guard/migration.sql"),
      "utf8"
    );

    expect(sql).toContain("shop_finance_rule_sets");
    expect(sql).toContain("commission_rate_bps");
    expect(sql).toMatch(/`technician_pricing_rate_percent` > 100/);
    expect(sql).toMatch(/`technician_pricing_rate_percent` < 10/);
    expect(sql).toMatch(/CHECK\s*\(\s*`technician_pricing_rate_percent` BETWEEN 10 AND 100\s*\)/i);
  });
});
