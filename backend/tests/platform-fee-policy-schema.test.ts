import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("platform fee policy schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const seed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260828233000_platform_fee_policy_foundation/migration.sql"
  );

  it("defines a versioned managed rule family and one policy per shop", () => {
    expect(schema).toContain("enum ShopPlatformFeePayerType");
    expect(schema).toContain("model ShopPlatformFeePolicy");
    expect(schema).toMatch(/familyCode\s+String\?/);
    expect(schema).toContain("@@unique([familyCode, version]");
    expect(schema).toMatch(/shopId\s+Int\s+@unique/);
    expect(schema).toMatch(/feeEnabled\s+Boolean\s+@default\(true\)/);
    expect(schema).toMatch(/payerType\s+ShopPlatformFeePayerType\s+@default\(SHOP\)/);
    expect(schema).toMatch(/version\s+Int\s+@default\(1\)/);
  });

  it("initializes the canonical booking family at 500 NDP without shop overrides", () => {
    expect(seed).toContain('familyCode: "booking_default"');
    expect(seed).toContain('feeType: "b_platform_fee"');
    expect(seed).toContain("baseAmountNdp: 500");
    expect(seed).not.toContain("shopPlatformFeePolicy.createMany");
  });

  it("ships an additive deterministic migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    expect(migration).toContain("shop_platform_fee_policies");
    expect(migration).toContain("family_code");
    expect(migration).toContain("booking_default");
  });
});
