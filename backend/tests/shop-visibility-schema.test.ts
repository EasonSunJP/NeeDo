import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("shop visibility persistence", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260913150000_shop_visibility/migration.sql"
  );
  const rollbackPath = join(
    process.cwd(),
    "prisma/migrations/20260913150000_shop_visibility/rollback.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
  const rollback = existsSync(rollbackPath) ? readFileSync(rollbackPath, "utf8") : "";

  it("keeps visibility on Shop instead of merchant, customer, or technician identity state", () => {
    const shop = schema.match(/model Shop \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(shop).toMatch(/visibility\s+String\s+@default\("public"\)\s+@db\.VarChar\(20\)/);
    expect(shop).toMatch(/visibilityUpdatedBy\s+Int\?\s+@map\("visibility_updated_by"\)/);
    expect(shop).toMatch(/visibilityUpdatedAt\s+DateTime\?\s+@map\("visibility_updated_at"\)/);
    expect(shop).toContain('@@index([visibility], map: "shops_visibility_idx")');
  });

  it("ships an additive migration and a reversible rollback", () => {
    expect(migration).toContain("ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public'");
    expect(migration).toContain("ADD COLUMN `visibility_updated_by` INTEGER NULL");
    expect(migration).toContain("ADD COLUMN `visibility_updated_at` DATETIME(3) NULL");
    expect(migration).toContain("CONSTRAINT `shops_visibility_updated_by_fkey`");
    expect(migration).toContain("CONSTRAINT `shops_visibility_value_check`");
    expect(migration).toContain("'public', 'privateAll', 'limited', 'network'");
    expect(migration).toContain("CREATE INDEX `shops_visibility_idx`");
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/iu);
    expect(rollback).toContain("DROP FOREIGN KEY `shops_visibility_updated_by_fkey`");
    expect(rollback).toContain("DROP CHECK `shops_visibility_value_check`");
    expect(rollback).toContain("DROP COLUMN `visibility`");
  });
});
