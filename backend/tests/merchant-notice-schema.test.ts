import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  MERCHANT_NOTICE_PERMISSIONS,
  SYSTEM_PERMISSIONS,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationPath = resolve(__dirname, "../prisma/migrations/20260905120000_merchant_official_notice_scope/migration.sql");
describe("merchant notice issuer schema", () => {
  it("persists issuer ownership and real creator identity without inventing historical identities", () => {
    const notice = schema.match(/model OfficialNotice \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const audience = schema.match(/enum OfficialNoticeAudienceType \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(notice).toMatch(/issuerType\s+OfficialNoticeIssuerType\s+@default\(PLATFORM\)/);
    expect(notice).toMatch(/issuerShopId\s+Int\?/);
    expect(notice).toMatch(/createdByIdentityId\s+Int\?/);
    expect(notice).toContain('onDelete: Restrict');
    expect(notice).toContain('@@index([issuerType, issuerShopId, createdAt, deletedAt]');
    expect(audience).toMatch(/SHOP_CARD_HOLDERS\s+@map\("shop_card_holders"\)/);
    expect(audience).toMatch(/SHOP_EMPLOYEES\s+@map\("shop_employees"\)/);
    expect(audience).toMatch(/SHOP_TECHNICIANS\s+@map\("shop_technicians"\)/);
  });
  it("adds a separate migration with constrained issuer and dedicated merchant permissions", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CHECK");
    expect(sql).toContain("created_by_identity_id");
    expect(sql).toMatch(
      /FOREIGN KEY \(`issuer_shop_id`\)[\s\S]*ON DELETE RESTRICT ON UPDATE RESTRICT/
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(`created_by_identity_id`\)[\s\S]*ON DELETE RESTRICT ON UPDATE RESTRICT/
    );
    for (const permission of ["read", "create", "review", "send"])
      expect(sql).toContain(`merchant-admin:notice:${permission}`);
    expect(sql).toMatch(/'merchant_owner', 'merchant_staff'/);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE\s+`?official_notices/i);
  });

  it("keeps merchant notice permissions in the formal seed and both merchant roles", () => {
    const permissionCodes = SYSTEM_PERMISSIONS.map((permission) => permission.code);
    const assignments = buildRolePermissionAssignments();
    const merchantPermissions = Object.values(MERCHANT_NOTICE_PERMISSIONS);

    expect(permissionCodes).toEqual(expect.arrayContaining(merchantPermissions));
    expect(assignments.merchant_owner).toEqual(expect.arrayContaining(merchantPermissions));
    expect(assignments.merchant_staff).toEqual(expect.arrayContaining(merchantPermissions));
  });
});
