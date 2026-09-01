import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

describe("technician data center permission", () => {
  it("is assigned only to the technician portal and administrators", () => {
    expect(SYSTEM_PERMISSIONS.map((permission) => permission.code)).toContain(
      "technician-data-center:read"
    );
    const assignments = buildRolePermissionAssignments();
    expect(assignments.technician).toContain("technician-data-center:read");
    expect(assignments.merchant_owner).not.toContain("technician-data-center:read");
    expect(assignments.customer).not.toContain("technician-data-center:read");
  });

  it("persists the permission through a migration", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260901130000_technician_data_center_permission/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("'technician-data-center:read'");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'technician')");
  });
});
