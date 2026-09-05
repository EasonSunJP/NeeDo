import {
  SYSTEM_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

describe("identity application permissions", () => {
  it("defines narrowly scoped applicant, merchant-review, operations, contract, bank, media, and purge permissions", () => {
    expect(SYSTEM_PERMISSIONS.map((permission) => permission.code)).toEqual(
      expect.arrayContaining([
        "identity-application:own",
        "merchant:technician-application:read",
        "merchant:technician-application:review",
        "merchant:technician-application:contact",
        "merchant:technician-application:export",
        "ops:merchant-application:read",
        "ops:merchant-application:review",
        "contract:read",
        "contract:accept",
        "bank-account:own",
        "identity-application-media:sensitive-read",
        "identity-application:purge"
      ])
    );
  });

  it("assigns applicant access to portal users and review access only to the responsible roles", () => {
    const assignments = buildRolePermissionAssignments();

    for (const role of [
      "customer",
      "technician",
      "merchant_owner",
      "merchant_staff",
      "scout"
    ] as const) {
      expect(assignments[role]).toEqual(
        expect.arrayContaining(["identity-application:own", "contract:read", "contract:accept"])
      );
    }
    expect(assignments.merchant_owner).toEqual(
      expect.arrayContaining([
        "merchant:technician-application:read",
        "merchant:technician-application:review",
        "merchant:technician-application:contact",
        "merchant:technician-application:export"
      ])
    );
    expect(assignments.operator).toEqual(
      expect.arrayContaining(["ops:merchant-application:read", "ops:merchant-application:review"])
    );
    expect(assignments.customer).not.toContain("ops:merchant-application:review");
    expect(assignments.customer).not.toContain("merchant:technician-application:review");
  });
});
