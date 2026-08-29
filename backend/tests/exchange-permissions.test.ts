import {
  SYSTEM_PERMISSION_CODES,
  SYSTEM_ROLE_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const EXCHANGE_PERMISSION_CODES = [
  "exchange:posts:list",
  "exchange:posts:detail",
  "exchange:posts:create-demand",
  "exchange:posts:create-intelligence",
  "exchange:posts:withdraw-own",
  "exchange:comments:list",
  "exchange:comments:create",
  "exchange:likes:write",
  "exchange:shares:create"
] as const;

const EXCHANGE_COMMON_PERMISSIONS = [
  "exchange:posts:list",
  "exchange:posts:detail",
  "exchange:comments:list",
  "exchange:comments:create",
  "exchange:likes:write",
  "exchange:shares:create"
] as const;

describe("formal NeeDo Exchange RBAC contract", () => {
  const assignments = buildRolePermissionAssignments();

  it("registers every Exchange permission exactly once", () => {
    for (const permission of EXCHANGE_PERMISSION_CODES) {
      expect(SYSTEM_PERMISSION_CODES.filter((code) => code === permission)).toHaveLength(1);
    }
  });

  it("grants customers demand publishing and common interactions only", () => {
    expect(assignments.customer).toEqual(
      expect.arrayContaining([
        ...EXCHANGE_COMMON_PERMISSIONS,
        "exchange:posts:create-demand",
        "exchange:posts:withdraw-own"
      ])
    );
    expect(assignments.customer).not.toContain("exchange:posts:create-intelligence");
  });

  it.each(["technician", "merchant_owner", "merchant_staff"] as const)(
    "grants %s intelligence publishing and common interactions only",
    (role) => {
      expect(assignments[role]).toEqual(
        expect.arrayContaining([
          ...EXCHANGE_COMMON_PERMISSIONS,
          "exchange:posts:create-intelligence",
          "exchange:posts:withdraw-own"
        ])
      );
      expect(assignments[role]).not.toContain("exchange:posts:create-demand");
    }
  );

  it("keeps Exchange permissions away from unrelated system roles", () => {
    const unrelatedRoles = SYSTEM_ROLE_CODES.filter(
      (role) =>
        !["admin", "customer", "technician", "merchant_owner", "merchant_staff"].includes(role)
    );

    for (const role of unrelatedRoles) {
      for (const permission of EXCHANGE_PERMISSION_CODES) {
        expect(assignments[role]).not.toContain(permission);
      }
    }
  });

  it("continues to grant every registered permission to admin", () => {
    expect(assignments.admin).toEqual(SYSTEM_PERMISSION_CODES);
  });
});
