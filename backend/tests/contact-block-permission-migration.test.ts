import { describe, expect, it } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260828031500_contact_block_permission/migration.sql"
);

describe("contact block permission deployment migration", () => {
  it("upserts contact:block and restores every formal IM role assignment", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("contact:block");
    expect(migration).toContain("联系人拉黑");
    expect(migration).toContain("拉黑或解除拉黑自己的联系人");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("`deleted_at` = NULL");
    expect(migration).toContain(
      "`roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer')"
    );
    expect(migration).toContain("INSERT INTO `role_permissions`");
  });
});
