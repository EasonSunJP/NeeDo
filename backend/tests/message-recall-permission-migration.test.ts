import { describe, expect, it } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260828060000_message_recall_permission/migration.sql"
);

describe("message recall permission deployment migration", () => {
  it("upserts message:recall and restores every formal IM role assignment", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("message:recall");
    expect(migration).toContain("撤回消息");
    expect(migration).toContain("在正式时限内撤回本人发送的 IM 消息");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("`deleted_at` = NULL");
    expect(migration).toContain(
      "`roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer')"
    );
    expect(migration).toContain("INSERT INTO `role_permissions`");
  });
});
