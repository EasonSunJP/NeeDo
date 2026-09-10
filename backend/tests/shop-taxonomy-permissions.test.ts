import {
  SYSTEM_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import { SHOP_TAXONOMY_ROUTE_PERMISSIONS } from "../src/routes/shop-taxonomy.routes";

describe("shop taxonomy permissions", () => {
  it("declares distinct read/write route permissions", () => {
    expect(SHOP_TAXONOMY_ROUTE_PERMISSIONS).toEqual({
      read: "merchant-admin:shop:service-taxonomy:read",
      write: "merchant-admin:shop:service-taxonomy:write"
    });
    const codes = new Set(SYSTEM_PERMISSIONS.map((permission) => permission.code));
    expect(codes.has(SHOP_TAXONOMY_ROUTE_PERMISSIONS.read)).toBe(true);
    expect(codes.has(SHOP_TAXONOMY_ROUTE_PERMISSIONS.write)).toBe(true);
  });

  it("allows staff to read while reserving writes for owners and admins", () => {
    const assignments = buildRolePermissionAssignments();
    expect(assignments.merchant_staff).toContain(SHOP_TAXONOMY_ROUTE_PERMISSIONS.read);
    expect(assignments.merchant_staff).not.toContain(SHOP_TAXONOMY_ROUTE_PERMISSIONS.write);
    expect(assignments.merchant_owner).toEqual(
      expect.arrayContaining([
        SHOP_TAXONOMY_ROUTE_PERMISSIONS.read,
        SHOP_TAXONOMY_ROUTE_PERMISSIONS.write
      ])
    );
    expect(assignments.admin).toEqual(
      expect.arrayContaining([
        SHOP_TAXONOMY_ROUTE_PERMISSIONS.read,
        SHOP_TAXONOMY_ROUTE_PERMISSIONS.write
      ])
    );
  });
});
