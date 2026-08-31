import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const permission = "backoffice:order-performance:write";

describe("order performance permission", () => {
  it("registers the operations write permission in the formal catalog", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain(permission);
  });

  it("grants writes only to admin and operator roles", () => {
    const assignments = buildRolePermissionAssignments();

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
  });
});
