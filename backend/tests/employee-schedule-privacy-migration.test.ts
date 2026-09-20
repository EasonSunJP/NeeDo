import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260829150000_employee_schedule_privacy/migration.sql"
);
const visibilityRenameMigrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260921113000_rename_availability_visibility/migration.sql"
);

describe("employee schedule privacy migration", () => {
  it("separates shop-private planning from technician-published availability", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("`source_type` ENUM('shop', 'technician') NOT NULL DEFAULT 'shop'");
    expect(migration).toContain(
      "`visibility` ENUM('shop_only', 'affiliated_shops') NOT NULL DEFAULT 'shop_only'"
    );
    expect(migration).toContain("availability_technician_visibility_range_idx");
  });

  it("renames the shared visibility without reusing affiliate-marketing terminology", () => {
    const migration = readFileSync(visibilityRenameMigrationPath, "utf8");

    expect(migration).toContain("SET `visibility` = 'technician_shops'");
    expect(migration).toContain("ENUM('shop_only', 'technician_shops')");
  });

  it("adds bounded overlap indexes for plans and confirmed bookings", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("schedule_slot_technician_shop_range_deleted_idx");
    expect(migration).toContain("booking_order_technician_status_range_deleted_idx");
  });
});
