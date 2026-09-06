import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";

describe("completed-order refund case permissions", () => {
  it("assigns refund case permissions only to the intended roles", () => {
    const byRole = buildRolePermissionAssignments();

    expect(byRole.customer).toContain("user:order-refund:write");
    expect(byRole.merchant_owner).toContain("merchant-admin:order-refund:write");
    expect(byRole.merchant_staff).toContain("merchant-admin:order-refund:write");
    expect(byRole.operator).toEqual(
      expect.arrayContaining([
        "backoffice:order-refund-dispute:read",
        "backoffice:order-refund-dispute:resolve"
      ])
    );
    expect(byRole.support).toContain("backoffice:order-refund-dispute:read");
    expect(byRole.support).not.toContain("backoffice:order-refund-dispute:resolve");
    expect(byRole.finance).not.toContain("backoffice:order-refund-dispute:resolve");
  });
});
