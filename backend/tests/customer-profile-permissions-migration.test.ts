import { describe, expect, it } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260826091000_customer_profile_permissions/migration.sql"
);

describe("customer profile permissions deployment migration", () => {
  it("upserts active profile permissions and restores customer/admin assignments", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("customer-profile:read");
    expect(migration).toContain("查看个人资料");
    expect(migration).toContain("读取当前客户个人资料");
    expect(migration).toContain("customer-profile:write");
    expect(migration).toContain("编辑个人资料");
    expect(migration).toContain("更新当前客户个人资料");
    expect(migration).toMatch(/`type`,\s*`module`,\s*`description`,\s*`is_system`/);
    expect(migration).toContain("'api', 'customer-profile'");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("`deleted_at` = NULL");
    expect(migration).toContain("`roles`.`code` IN ('customer', 'admin')");
    expect(migration).toContain("`permissions`.`code` IN ('customer-profile:read', 'customer-profile:write')");
    expect(migration).toContain("INSERT INTO `role_permissions`");
  });
});
