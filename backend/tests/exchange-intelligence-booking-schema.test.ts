import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260905180000_exchange_intelligence_booking/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const modelSource = (name: string): string => {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m"));
  return match?.[0] ?? "";
};

describe("Exchange Intelligence booking schema", () => {
  it("binds an Intelligence row to exactly one formal service with immutable snapshots", () => {
    const intelligence = modelSource("ExchangeIntelligence");

    expect(intelligence).toMatch(/serviceId\s+Int\?\s+@map\("service_id"\)/);
    expect(intelligence).toMatch(
      /technicianServiceId\s+Int\?\s+@map\("technician_service_id"\)/
    );
    expect(intelligence).toMatch(
      /serviceNameSnapshot\s+String\?\s+@map\("service_name_snapshot"\) @db\.VarChar\(160\)/
    );
    expect(intelligence).toMatch(
      /serviceDurationSnapshot\s+Int\?\s+@map\("service_duration_snapshot"\)/
    );
    expect(intelligence).toMatch(
      /service\s+Service\?\s+@relation\(fields: \[serviceId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/
    );
    expect(intelligence).toMatch(
      /technicianService\s+TechnicianService\?\s+@relation\(fields: \[technicianServiceId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/
    );
    expect(intelligence).toContain(
      '@@index([serviceId, deletedAt], map: "exchange_intelligences_service_deleted_idx")'
    );
    expect(intelligence).toContain(
      '@@index([technicianServiceId, deletedAt], map: "exchange_intelligences_technician_service_deleted_idx")'
    );
  });

  it("links ordinary bookings back to the originating Intelligence post", () => {
    const booking = modelSource("BookingOrder");

    expect(booking).toMatch(
      /exchangeIntelligencePostId\s+Int\?\s+@map\("exchange_intelligence_post_id"\)/
    );
    expect(booking).toContain(
      "exchangeIntelligence ExchangeIntelligence? @relation(fields: [exchangeIntelligencePostId], references: [postId], onDelete: Restrict, onUpdate: Restrict)"
    );
    expect(booking).toContain(
      '@@index([exchangeIntelligencePostId, createdAt], map: "booking_orders_exchange_intelligence_created_idx")'
    );
  });

  it("ships an additive migration that keeps legacy rows unbound and constrains new bindings", () => {
    expect(migration).toContain("ADD COLUMN `service_id` INTEGER NULL");
    expect(migration).toContain("ADD COLUMN `technician_service_id` INTEGER NULL");
    expect(migration).toContain("ADD COLUMN `service_name_snapshot` VARCHAR(160) NULL");
    expect(migration).toContain("ADD COLUMN `service_duration_snapshot` INTEGER NULL");
    expect(migration).toContain("ADD COLUMN `exchange_intelligence_post_id` INTEGER NULL");
    expect(migration).toContain("exchange_intelligences_service_binding_check");
    expect(migration).toContain("exchange_intelligences_service_fkey");
    expect(migration).toContain("exchange_intelligences_technician_service_fkey");
    expect(migration).toContain("booking_orders_exchange_intelligence_fkey");
    expect(migration).toContain("REFERENCES `exchange_intelligences` (`post_id`)");
    expect(migration.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).not.toMatch(/(?:^|\n)\s*(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
  });
});
