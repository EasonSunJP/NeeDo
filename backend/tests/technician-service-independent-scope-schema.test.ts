import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("technician service independent scope schema", () => {
  it("keeps the legacy shop reference optional for a technician-owned portfolio", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(resolve(
      __dirname,
      "../prisma/migrations/20260908210000_technician_service_independent_scope/migration.sql"
    ), "utf8");
    const model = schema.slice(schema.indexOf("model TechnicianService {"), schema.indexOf("model BookingOrder {"));

    expect(model).toMatch(/shopId\s+Int\?/);
    expect(model).toMatch(/shop\s+Shop\?/);
    expect(migration).toMatch(/MODIFY `shop_id` INTEGER NULL/);
  });
});
