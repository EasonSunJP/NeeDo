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

const EXCHANGE_REQUEST_FEE_PERMISSION_CODES = [
  "backoffice:exchange-request-fee:read",
  "backoffice:exchange-request-fee:write"
] as const;

const EXCHANGE_COMMON_PERMISSIONS = [
  "exchange:posts:list",
  "exchange:posts:detail",
  "exchange:comments:list",
  "exchange:comments:create",
  "exchange:likes:write",
  "exchange:shares:create"
] as const;

const EXCHANGE_REQUEST_FEE_READ_ROLES = new Set(["admin", "operator", "finance", "viewer"]);
const EXCHANGE_REQUEST_FEE_WRITE_ROLES = new Set(["admin", "finance"]);

describe("formal NeeDo Exchange RBAC contract", () => {
  const assignments = buildRolePermissionAssignments();

  it("registers every Exchange permission exactly once", () => {
    for (const permission of [
      ...EXCHANGE_PERMISSION_CODES,
      ...EXCHANGE_REQUEST_FEE_PERMISSION_CODES
    ]) {
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

  it.each(["technician", "merchant_staff"] as const)(
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

  it("grants merchant owners both demand and intelligence publishing", () => {
    expect(assignments.merchant_owner).toEqual(
      expect.arrayContaining([
        ...EXCHANGE_COMMON_PERMISSIONS,
        "exchange:posts:create-demand",
        "exchange:posts:create-intelligence",
        "exchange:posts:withdraw-own"
      ])
    );
  });

  it("grants Request fee permissions to their exact system-role allowlists", () => {
    for (const role of SYSTEM_ROLE_CODES) {
      if (EXCHANGE_REQUEST_FEE_READ_ROLES.has(role)) {
        expect(assignments[role]).toContain("backoffice:exchange-request-fee:read");
      } else {
        expect(assignments[role]).not.toContain("backoffice:exchange-request-fee:read");
      }

      if (EXCHANGE_REQUEST_FEE_WRITE_ROLES.has(role)) {
        expect(assignments[role]).toContain("backoffice:exchange-request-fee:write");
      } else {
        expect(assignments[role]).not.toContain("backoffice:exchange-request-fee:write");
      }
    }

    expect(assignments.merchant_staff).not.toContain("exchange:posts:create-demand");
  });

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
