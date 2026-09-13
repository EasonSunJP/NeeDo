import {
  EXCHANGE_OPERATIONS_PERMISSIONS,
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Exchange operations permission", () => {
  it("registers one dedicated backoffice read permission", () => {
    expect(EXCHANGE_OPERATIONS_PERMISSIONS.read).toBe("backoffice:exchange:read");
    expect(SYSTEM_PERMISSION_CODES).toContain(EXCHANGE_OPERATIONS_PERMISSIONS.read);
  });

  it("grants reads only to admin, operator, and read-only viewer", () => {
    const assignments = buildRolePermissionAssignments();
    for (const role of ["admin", "operator", "viewer"] as const) {
      expect(assignments[role]).toContain(EXCHANGE_OPERATIONS_PERMISSIONS.read);
    }
    for (const role of [
      "customer",
      "technician",
      "merchant_owner",
      "merchant_staff",
      "support",
      "finance",
      "broker",
      "scout"
    ] as const) {
      expect(assignments[role]).not.toContain(EXCHANGE_OPERATIONS_PERMISSIONS.read);
    }
  });

  it("ships an additive migration for the same three system roles", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260913110000_exchange_operations_read_permission/migration.sql"
      ),
      "utf8"
    );

    expect(sql).toContain("backoffice:exchange:read");
    for (const role of ["admin", "operator", "viewer"]) expect(sql).toContain(`'${role}'`);
    expect(sql).not.toMatch(/\b(?:DELETE|DROP|TRUNCATE)\b/i);
  });
});
