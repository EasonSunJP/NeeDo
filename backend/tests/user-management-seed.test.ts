import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLE_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import { getAdminSeedConfig } from "../prisma/seed";

describe("user management seed contract", () => {
  it("defines the Step 04 system roles in the required order", () => {
    expect(SYSTEM_ROLE_CODES).toEqual([
      "admin",
      "operator",
      "finance",
      "support",
      "merchant_owner",
      "merchant_staff",
      "technician",
      "customer",
      "broker",
      "scout",
      "viewer"
    ]);
  });

  it("covers the required base permission modules", () => {
    const modules = Array.from(new Set(SYSTEM_PERMISSIONS.map((permission) => permission.module)));

    expect(modules).toEqual(
      expect.arrayContaining(["auth", "user", "role", "permission", "menu", "dashboard"])
    );
  });

  it("assigns every base permission to the admin role", () => {
    const assignments = buildRolePermissionAssignments();

    expect(assignments.admin).toEqual(SYSTEM_PERMISSIONS.map((permission) => permission.code));
  });

  it("requires the super admin password to come from ADMIN_DEFAULT_PASSWORD", () => {
    expect(() => getAdminSeedConfig({})).toThrow("ADMIN_DEFAULT_PASSWORD");

    expect(getAdminSeedConfig({ ADMIN_DEFAULT_PASSWORD: "S3cure-dev-password!" })).toMatchObject({
      email: "admin@example.com",
      password: "S3cure-dev-password!",
      username: "NeeDo Super Admin"
    });
  });
});
