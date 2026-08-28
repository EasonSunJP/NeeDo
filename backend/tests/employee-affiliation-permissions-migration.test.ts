import { describe, expect, it } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260829090000_employee_affiliation_permissions/migration.sql"
);

describe("employee affiliation permissions deployment migration", () => {
  it("upserts the read/write permissions and restores merchant role assignments", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("merchant-admin:employee-affiliation:read");
    expect(migration).toContain("商户员工从属读取");
    expect(migration).toContain("按当前店铺读取员工身份和在职从属关系");
    expect(migration).toContain("merchant-admin:employee-affiliation:write");
    expect(migration).toContain("商户员工从属维护");
    expect(migration).toContain("按当前店铺创建、更新或结束员工从属关系");
    expect(migration).toMatch(/`type`,\s*`module`,\s*`description`,\s*`is_system`/);
    expect(migration).toContain("'api', 'merchant-admin'");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("`deleted_at` = NULL");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff')");
    expect(migration).toContain(
      "`permissions`.`code` IN ('merchant-admin:employee-affiliation:read', 'merchant-admin:employee-affiliation:write')"
    );
    expect(migration).toContain("INSERT INTO `role_permissions`");
  });
});
