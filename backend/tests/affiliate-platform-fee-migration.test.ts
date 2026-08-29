import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate platform fee migration", () => {
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260830010000_affiliate_platform_fee_reserve_settlement/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("creates a 10 percent global default and additive fee snapshots", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("CREATE TABLE `affiliate_platform_fee_rules`");
    expect(migration).toContain("`fee_bps` INTEGER NOT NULL");
    expect(migration).toContain("1000");
    expect(migration).toContain("`platform_fee_reserve_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("`commission_frozen_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("`platform_fee_frozen_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("`platform_fee_captured_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("`platform_fee_released_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("`platform_fee_ndp` INTEGER NOT NULL DEFAULT 0");
  });

  it("backfills existing reservations as zero-fee commission-only snapshots", () => {
    expect(migration).toMatch(
      /UPDATE `affiliate_budget_reservations`[\s\S]*`commission_frozen_ndp` = `total_frozen_ndp`/
    );
    expect(migration).toMatch(
      /UPDATE `affiliate_tasks`[\s\S]*`platform_fee_bps` = 0[\s\S]*`platform_fee_reserve_ndp` = 0/
    );
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toContain("DROP TABLE");
  });

  it("enforces fee bounds and indexed version history", () => {
    expect(migration).toMatch(/CHECK\s*\(`fee_bps` BETWEEN 0 AND 10000\)/i);
    expect(migration).toContain("affiliate_platform_fee_rules_scope_shop_version_key");
    expect(migration).toContain("affiliate_platform_fee_rules_active_key_key");
    expect(migration).toContain("affiliate_platform_fee_rules_effective_idx");
  });
});
