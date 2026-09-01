import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";

describe("user group and policy OpenAPI/RBAC contracts", () => {
  it("documents every group, global policy, and campaign route family", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    for (const path of [
      "/api/v1/backoffice/user-groups",
      "/api/v1/backoffice/user-groups/{groupCode}",
      "/api/v1/backoffice/user-groups/{groupCode}/members",
      "/api/v1/backoffice/user-global-settings",
      "/api/v1/backoffice/user-global-settings/draft",
      "/api/v1/backoffice/user-global-settings/publish",
      "/api/v1/backoffice/ndp-experience-campaigns",
      "/api/v1/backoffice/ndp-experience-campaigns/draft",
      "/api/v1/backoffice/ndp-experience-campaigns/{versionPublicId}/publish"
    ]) {
      expect(response.body.paths).toHaveProperty(path);
    }
  });

  it("seeds read permissions for viewers and write permissions for operators", () => {
    const assignments = buildRolePermissionAssignments();
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260901194000_user_group_policy_permissions/migration.sql"
      ),
      "utf8"
    );
    for (const code of [
      "backoffice:user-group:read",
      "backoffice:user-group:write",
      "backoffice:user-policy:read",
      "backoffice:user-policy:publish",
      "backoffice:ndp-experience-campaign:read",
      "backoffice:ndp-experience-campaign:publish"
    ]) {
      expect(assignments.operator).toContain(code);
      expect(migration).toContain(code);
    }
    expect(assignments.viewer).toEqual(
      expect.arrayContaining([
        "backoffice:user-group:read",
        "backoffice:user-policy:read",
        "backoffice:ndp-experience-campaign:read"
      ])
    );
    expect(assignments.viewer).not.toContain("backoffice:user-policy:publish");
  });
});
