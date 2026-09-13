import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260913103000_merchant_order_service_transitions/migration.sql"
);
const rollbackPath = resolve(
  process.cwd(),
  "prisma/migrations/20260913103000_merchant_order_service_transitions/rollback.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const rollback = existsSync(rollbackPath) ? readFileSync(rollbackPath, "utf8") : "";

describe("merchant order service transition permission migration", () => {
  it("grants only the existing formal start and end permissions to merchant operators", () => {
    expect(migration).toContain("INSERT INTO `role_permissions`");
    expect(migration).toContain("'order:service:start'");
    expect(migration).toContain("'order:service:end'");
    expect(migration).toContain("'merchant_owner'");
    expect(migration).toContain("'merchant_staff'");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).not.toContain("INSERT INTO `permissions`");
  });

  it("provides a targeted rollback for the merchant role grants", () => {
    expect(rollback).toContain("UPDATE `role_permissions`");
    expect(rollback).toContain("'order:service:start'");
    expect(rollback).toContain("'order:service:end'");
    expect(rollback).toContain("'merchant_owner'");
    expect(rollback).toContain("'merchant_staff'");
    expect(rollback).toContain("`role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)");
  });
});
