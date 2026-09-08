import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { ekycApplicationOpenApiPaths } from "../src/api/ekyc-application.openapi";
import { readFileSync } from "node:fs";
import { join } from "node:path";
describe("manual eKYC deployment contract", () => {
  it("documents all eight actual operations and required explicit manual approval evidence", () => {
    const paths = ekycApplicationOpenApiPaths("/api/v1");
    expect(Object.keys(paths)).toHaveLength(8);
    expect(JSON.stringify(paths["/api/v1/ops/ekyc-applications/{id}/approve"])).toContain(
      "identityConfirmed"
    );
    expect(JSON.stringify(paths)).toContain("profile");
    expect(JSON.stringify(paths)).toContain("userPublicId");
  });
  it("grants new permissions exactly wherever analogous existing owner/read/review permissions are granted", () => {
    for (const permissions of Object.values(buildRolePermissionAssignments())) {
      for (const [oldCode, newCode] of [
        ["identity-application:own", "ekyc-application:own"],
        ["ops:merchant-application:read", "ops:ekyc-application:read"],
        ["ops:merchant-application:review", "ops:ekyc-application:review"]
      ])
        expect(permissions.includes(newCode as never)).toBe(permissions.includes(oldCode as never));
    }
  });
  it("uses a unique nullable active key and encrypted persisted profile", () => {
    const schema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/activeUserId\s+Int\?\s+@unique/);
    expect(schema).toMatch(/profileEncrypted\s+String/);
    const sql = readFileSync(
      join(__dirname, "../prisma/migrations/20260907110000_manual_ekyc_applications/migration.sql"),
      "utf8"
    );
    expect(sql).toContain("UNIQUE INDEX `ekyc_applications_active_user_id_key`");
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
  });
});
