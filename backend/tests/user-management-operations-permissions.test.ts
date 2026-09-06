import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const writePermissions = [
  "backoffice:user-usage:comment",
  "backoffice:user-refund:amend"
] as const;

describe("user management operations permissions", () => {
  it("registers and persists timeline comment and refund amendment permissions", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260906123000_user_management_operations_permissions/migration.sql"
      ),
      "utf8"
    );

    for (const permission of writePermissions) {
      expect(SYSTEM_PERMISSION_CODES).toContain(permission);
      expect(migration).toContain(permission);
    }
  });

  it("grants both write permissions only to admin and operator roles", () => {
    const assignments = buildRolePermissionAssignments();

    for (const permission of writePermissions) {
      expect(assignments.admin).toContain(permission);
      expect(assignments.operator).toContain(permission);
      for (const role of [
        "customer",
        "technician",
        "merchant_owner",
        "merchant_staff",
        "support",
        "finance",
        "viewer",
        "broker",
        "scout"
      ] as const) {
        expect(assignments[role]).not.toContain(permission);
      }
    }
  });
});
