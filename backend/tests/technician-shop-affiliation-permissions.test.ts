import {
  SYSTEM_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const employeePermissionCodes = [
  "merchant-admin:employee-affiliation:read",
  "merchant-admin:employee-affiliation:write"
];

describe("employee affiliation permission catalog", () => {
  it("defines each API permission once", () => {
    const codes = SYSTEM_PERMISSIONS.map((permission) => permission.code);
    for (const code of employeePermissionCodes) {
      expect(codes.filter((candidate) => candidate === code)).toHaveLength(1);
      expect(SYSTEM_PERMISSIONS.find((permission) => permission.code === code)).toMatchObject({
        type: "api",
        module: "merchant-admin"
      });
    }
  });

  it("assigns read and write only to merchant roles that manage the current shop", () => {
    const assignments = buildRolePermissionAssignments();
    for (const role of ["merchant_owner", "merchant_staff"] as const) {
      expect(assignments[role]).toEqual(expect.arrayContaining(employeePermissionCodes));
    }
    for (const role of ["customer", "technician", "finance", "support"] as const) {
      expect(assignments[role]).not.toEqual(expect.arrayContaining(employeePermissionCodes));
    }
  });
});
