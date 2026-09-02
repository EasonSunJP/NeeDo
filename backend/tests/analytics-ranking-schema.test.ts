import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
const compact = (value: string): string => value.replace(/\s+/gu, " ").trim();

describe("formal analytics ranking schema", () => {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260902100000_analytics_ranking_identity_permission/migration.sql";

  it("adds a real immutable UUID to every technician service", () => {
    expect(schema).toContain(
      'publicId String @unique(map: "technician_services_public_id_key") @default(uuid()) @map("public_id") @db.Char(36)'
    );

    const migration = read(migrationPath);
    const sql = compact(migration);
    expect(sql).toContain("ALTER TABLE `technician_services` ADD COLUMN `public_id` CHAR(36) NULL");
    expect(sql).toContain(
      "UPDATE `technician_services` SET `public_id` = UUID() WHERE `public_id` IS NULL"
    );
    expect(sql).toContain(
      "ALTER TABLE `technician_services` MODIFY COLUMN `public_id` CHAR(36) NOT NULL"
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX `technician_services_public_id_key` ON `technician_services`(`public_id`)"
    );
    expect(migration).not.toMatch(/CONCAT\s*\([^)]*(?:technician|service|id)/iu);
  });

  it("adds the exact bounded completed-payment ranking index", () => {
    expect(schema).toContain(
      '@@index([status, paymentStatus, deletedAt, paymentConfirmedAt, shopId, id], map: "booking_orders_ranking_window_idx")'
    );
    expect(compact(read(migrationPath))).toContain(
      "CREATE INDEX `booking_orders_ranking_window_idx` ON `booking_orders`(`status`, `payment_status`, `deleted_at`, `payment_confirmed_at`, `shop_id`, `id`)"
    );
  });

  it("deploys ranking read permission only to admin and operator", () => {
    const permission = "backoffice:analytics-ranking:read";
    const migration = read(migrationPath);
    expect(SYSTEM_PERMISSION_CODES).toContain(permission);
    expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("`roles`.`code` IN ('admin', 'operator')");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");

    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toContain(permission);
    expect(assignments.operator).toContain(permission);
    for (const [role, permissions] of Object.entries(assignments)) {
      if (role !== "admin" && role !== "operator") expect(permissions).not.toContain(permission);
    }
  });
});
