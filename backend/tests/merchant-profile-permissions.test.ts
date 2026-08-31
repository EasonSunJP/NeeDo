import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

describe("merchant identity profile permissions", () => {
  it("assigns self-read and self-write only to merchant portal roles", () => {
    const codes = SYSTEM_PERMISSIONS.map((permission) => permission.code);
    expect(codes).toEqual(expect.arrayContaining([
      "merchant-profile:read",
      "merchant-profile:write"
    ]));
    const assignments = buildRolePermissionAssignments();
    for (const role of ["merchant_owner", "merchant_staff"] as const) {
      expect(assignments[role]).toEqual(expect.arrayContaining([
        "merchant-profile:read",
        "merchant-profile:write"
      ]));
    }
    expect(assignments.customer).not.toContain("merchant-profile:read");
    expect(assignments.technician).not.toContain("merchant-profile:write");
  });

  it("backfills profiles and persistent RBAC assignments", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260901123000_merchant_profile_permissions_and_backfill/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("INSERT INTO `merchant_identity_profiles`");
    expect(migration).toContain("'merchant_owner', 'merchant_staff', 'merchant_organization', 'merchant'");
    expect(migration).toContain("'merchant-profile:read'");
    expect(migration).toContain("'merchant-profile:write'");
  });
});
