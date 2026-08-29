import { describe, expect, it } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260830060000_contact_delete_permission/migration.sql"
);

describe("contact delete permission deployment migration", () => {
  it("upserts contact:delete and restores every formal IM role assignment", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("contact:delete");
    expect(migration).toContain("联系人删除");
    expect(migration).toContain("软删除当前账号自己的联系人关系");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("`deleted_at` = NULL");
    expect(migration).toContain(
      "`roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer')"
    );
    expect(migration).toContain("INSERT INTO `role_permissions`");
  });
});
