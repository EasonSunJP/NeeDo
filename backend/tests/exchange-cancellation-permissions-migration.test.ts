import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange bilateral cancellation API permission migration", () => {
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260905130000_exchange_cancellation_api_permissions/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("adds exact read/write permissions for every participating role", () => {
    expect(migration).toContain("exchange:cancellation:read-own");
    expect(migration).toContain("exchange:cancellation:write-own");
    expect(migration).toContain("'admin', 'customer', 'technician', 'merchant_owner', 'merchant_staff'");
    expect(migration).not.toMatch(/DROP|DELETE FROM|UPDATE `(?:booking_orders|wallets|affiliate)/i);
  });
});
