import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OFFICIAL_NOTICE_PERMISSIONS,
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const permissionCodes = [
  "page:backoffice-official-notice",
  "button:backoffice-official-notice-create",
  "button:backoffice-official-notice-review",
  "button:backoffice-official-notice-send"
] as const;

describe("formal official notice RBAC", () => {
  it("exports the stable permission contract", () => {
    expect(OFFICIAL_NOTICE_PERMISSIONS).toEqual({
      read: permissionCodes[0],
      create: permissionCodes[1],
      review: permissionCodes[2],
      send: permissionCodes[3]
    });
    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(permissionCodes));
  });

  it("grants operations roles without leaking broadcast rights to business identities", () => {
    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toEqual(expect.arrayContaining(permissionCodes));
    expect(assignments.operator).toEqual(expect.arrayContaining(permissionCodes));
    for (const role of [
      "customer",
      "technician",
      "merchant_owner",
      "merchant_staff",
      "scout"
    ] as const) {
      for (const permission of permissionCodes) expect(assignments[role]).not.toContain(permission);
    }
  });

  it("upserts permission rows and restores admin/operator grants additively", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../prisma/migrations/20260902143000_official_notice_delivery/migration.sql"
      ),
      "utf8"
    );
    for (const permission of permissionCodes) expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("WHERE `roles`.`code` IN ('admin', 'operator')");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
