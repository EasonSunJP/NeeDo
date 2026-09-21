import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

describe("technician per-shop work-state persistence", () => {
  it("stores one state per shop and keeps the operating shop as UI context", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        root,
        "prisma/migrations/20260921180000_technician_current_receiving_shop/migration.sql"
      ),
      "utf8"
    );

    expect(schema).toMatch(/currentOperatingShopId\s+Int\?\s+@map\("current_operating_shop_id"\)/);
    expect(schema).toMatch(/workStates\s+TechnicianWorkState\[\]/);
    expect(schema).toMatch(/shopId\s+Int\?\s+@map\("shop_id"\)/);
    expect(schema).toContain('@@unique([technicianProfileId, shopId], map: "technician_work_states_profile_shop_key")');
    expect(migration).toContain("ADD COLUMN `current_operating_shop_id` INTEGER NULL");
    expect(migration).toContain("ADD COLUMN `shop_id` INTEGER NULL");
    expect(migration).toContain("technician_work_states_profile_shop_key");
    expect(migration).toContain("technician_profiles_current_operating_shop_id_fkey");
    expect(migration).toContain("technician_work_states_shop_id_fkey");
    expect(migration).toContain("technician_shop_affiliations");
    expect(migration).toMatch(/`work_status`\s*=\s*'active'/);
    expect(migration).toMatch(/`active_key`\s+IS NOT NULL/);
  });
});
