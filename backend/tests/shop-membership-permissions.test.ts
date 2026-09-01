import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import { SHOP_MEMBERSHIP_ROUTE_PERMISSIONS } from "../src/routes/shop-membership.routes";
import { SHOP_MEMBERSHIP_CARD_ISSUANCE_ROUTE_PERMISSIONS } from "../src/routes/shop-membership-card-issuance.routes";
import { SHOP_MEMBERSHIP_CARD_TOPUP_ROUTE_PERMISSIONS } from "../src/routes/shop-membership-card-topup.routes";
import { SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS } from "../src/routes/shop-membership-card-redemption.routes";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const membershipPermissions = [
  "shop.member.view",
  "shop.member.create",
  "shop.member.analytics.view",
  "shop.member.operation_log.view"
] as const;

describe("shop membership permissions", () => {
  it("declares the exact route permission map", () => {
    expect(SHOP_MEMBERSHIP_ROUTE_PERMISSIONS).toEqual({
      view: "shop.member.view",
      create: "shop.member.create",
      analytics: "shop.member.analytics.view",
      operationLog: "shop.member.operation_log.view",
      customerRead: "customer-profile:read"
    });
    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(membershipPermissions));
    expect(SHOP_MEMBERSHIP_CARD_ISSUANCE_ROUTE_PERMISSIONS).toEqual({ issue: "shop.member.card.issue" });
    expect(SHOP_MEMBERSHIP_CARD_TOPUP_ROUTE_PERMISSIONS).toEqual({
      create: "shop.member.card.topup.create",
      merchantRead: "shop.member.view",
      customerRead: "customer-profile:read"
    });
    expect(SHOP_MEMBERSHIP_CARD_REDEMPTION_ROUTE_PERMISSIONS).toEqual({
      create: "shop.member.card.redeem",
      candidates: "shop.member.card.redeem",
      merchantRead: "shop.member.view",
      customerRead: "customer-profile:read",
      refund: "shop.member.card.refund"
    });
  });

  it("grants all membership controls to owners and read-only access to staff", () => {
    const assignments = buildRolePermissionAssignments();
    expect(assignments.merchant_owner).toEqual(expect.arrayContaining(membershipPermissions));
    expect(assignments.merchant_owner).toContain("shop.member.card.adjust.request");
    expect(assignments.merchant_owner).toContain("shop.member.card.topup.create");
    expect(assignments.merchant_staff).toContain("shop.member.view");
    expect(assignments.merchant_staff).not.toContain("shop.member.create");
    expect(assignments.merchant_staff).not.toContain("shop.member.analytics.view");
    expect(assignments.merchant_staff).not.toContain("shop.member.operation_log.view");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.adjust.request");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.topup.create");
    expect(assignments.merchant_staff).toContain("shop.member.card.redeem");
    expect(assignments.merchant_owner).toContain("shop.member.card.refund");
    expect(assignments.merchant_staff).not.toContain("shop.member.card.refund");
  });

  it("deploys the same role grants when migrations run without a seed", () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20260831123000_shop_membership_permissions/migration.sql"),
      "utf8"
    );
    for (const permission of membershipPermissions) expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("`roles`.`code` IN ('admin', 'merchant_owner')");
    expect(migration).toContain("`roles`.`code` = 'merchant_staff'");
    expect(migration).toContain("`permissions`.`code` = 'shop.member.view'");
  });
});
