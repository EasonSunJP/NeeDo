import { readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260828113000_affiliate_profile_permissions/migration.sql"
);

describe("affiliate profile permissions deployment migration", () => {
  it("upserts profile permissions and restricts marketplace actions to activated affiliates", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("page:affiliate-profile");
    expect(migration).toContain("button:affiliate-profile-edit");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("INSERT INTO `role_permissions`");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'scout')");
    expect(migration).toContain("'page:affiliate-marketplace'");
    expect(migration).toContain("'button:affiliate-claim'");
    expect(migration).toContain("UPDATE `role_permissions`");
    expect(migration).toContain(
      "'operator', 'finance', 'support', 'merchant_owner', 'merchant_staff', 'technician', 'customer', 'broker', 'viewer'"
    );
    expect(migration).toContain("`role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)");
  });
});
