import fs from "node:fs";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(backendRoot, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  backendRoot,
  "prisma/migrations/20260829130000_order_acceptance_pause/migration.sql"
);

describe("Order acceptance pause schema", () => {
  it("persists independent merchant and shop acceptance pauses", () => {
    expect(schema).toContain("enum OrderAcceptancePauseSubjectType");
    expect(schema).toContain("enum OrderAcceptancePauseAuthorityType");
    expect(schema).toContain("enum OrderAcceptancePauseStatus");
    expect(schema).toContain("model OrderAcceptancePause");
    expect(schema).toMatch(/merchantAccountId\s+Int\?\s+@map\("merchant_account_id"\)/);
    expect(schema).toMatch(/shopId\s+Int\?\s+@map\("shop_id"\)/);
    expect(schema).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(schema).toContain('@@map("order_acceptance_pauses")');
  });

  it("ships deployable database constraints, indexes, and RBAC grants", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migration = fs.readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE `order_acceptance_pauses`");
    expect(migration).toContain("order_acceptance_pauses_subject_shape_chk");
    expect(migration).toContain("order_acceptance_pauses_release_shape_chk");
    expect(migration).toContain("order_acceptance_pauses_subject_active_idx");
    expect(migration).toContain("backoffice:order-acceptance-pause:read");
    expect(migration).toContain("backoffice:order-acceptance-pause:write");
    expect(migration).toContain("merchant-admin:order-acceptance-pause:read");
    expect(migration).toContain("merchant-admin:order-acceptance-pause:write");
    expect(migration).toContain("INSERT INTO `role_permissions`");
  });
});
