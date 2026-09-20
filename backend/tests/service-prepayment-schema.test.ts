import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("service prepayment schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260920120000_service_prepayments/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  const enumBlock = (name: string): string => {
    const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing enum ${name}`);
    return match[1];
  };

  it("persists explicit service prepayment states and one aggregate per subject", () => {
    expect(enumBlock("ServicePrepaymentStatus")).toMatch(/PENDING\s+@map\("pending"\)/);
    expect(enumBlock("ServicePrepaymentStatus")).toMatch(/CONFIRMED\s+@map\("confirmed"\)/);
    expect(enumBlock("ServicePrepaymentStatus")).toMatch(/REFUNDED\s+@map\("refunded"\)/);

    const prepayment = modelBlock("ServicePrepayment");
    expect(prepayment).toMatch(/bookingOrderId\s+Int\?\s+@unique/);
    expect(prepayment).toMatch(/exchangePostId\s+Int\?\s+@unique/);
    expect(prepayment).toMatch(/walletHoldId\s+Int\?\s+@unique/);
    expect(prepayment).toMatch(/baseAmountJpy\s+Int/);
    expect(prepayment).toMatch(/percent\s+Int/);
    expect(prepayment).toMatch(/amountJpy\s+Int/);
    expect(prepayment).toMatch(/confirmedAmountJpy\s+Int\s+@default\(0\)/);
    expect(prepayment).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(prepayment).toMatch(/requestFingerprint\s+String[\s\S]*@db\.Char\(64\)/);
    expect(prepayment).toMatch(/createdByIdentityId\s+Int/);
    expect(prepayment).toMatch(/deletedAt\s+DateTime\?/);
  });

  it("persists immutable Request-to-Booking allocations", () => {
    const allocation = modelBlock("ServicePrepaymentAllocation");
    expect(allocation).toMatch(/sourcePrepaymentId\s+Int/);
    expect(allocation).toMatch(/bookingPrepaymentId\s+Int\s+@unique/);
    expect(allocation).toMatch(/exchangeMatchParticipantId\s+Int\s+@unique/);
    expect(allocation).toMatch(/amountJpy\s+Int/);
    expect(allocation).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  it("ships a guarded migration and allows distinct Request fee and service holds", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("service_prepayments_exactly_one_subject");
    expect(migration).toContain("service_prepayments_percent_check");
    expect(migration).toContain("service_prepayment_allocations");
    expect(migration).toContain("DROP INDEX `wallet_holds_exchange_post_id_key`");
    expect(migration).toContain("wallet_holds_exchange_post_id_idx");
    expect(migration).toContain("JSON_SET");
    expect(migration).toContain("minimumPrepaymentPercent");
  });
});
