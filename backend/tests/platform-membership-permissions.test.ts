import request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("platform membership administration permissions", () => {
  it("seeds the formal permissions for operator and read-only viewer roles", () => {
    const assignments = buildRolePermissionAssignments();
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260901190000_platform_membership_permissions/migration.sql"
      ),
      "utf8"
    );
    for (const code of [
      "backoffice:membership-tier:read",
      "backoffice:membership-tier:publish",
      "backoffice:membership-benefit:read",
      "backoffice:membership-benefit:write",
      "backoffice:user-membership:write"
    ]) {
      expect(assignments.operator).toContain(code);
      expect(migration).toContain(code);
    }
    expect(assignments.viewer).toEqual(
      expect.arrayContaining([
        "backoffice:membership-tier:read",
        "backoffice:membership-benefit:read"
      ])
    );
    expect(assignments.viewer).not.toContain("backoffice:user-membership:write");
  });

  it("separates tier and benefit reads from publication and user membership writes", async () => {
    const service = {
      listTiersForAdministration: jest.fn(async () => []),
      listBenefitsForAdministration: jest.fn(async () => []),
      saveTierDraft: jest.fn(),
      publishTierVersion: jest.fn(),
      getTierDraft: jest.fn(),
      updateBenefit: jest.fn(),
      changeEntitlement: jest.fn()
    };
    const fixture = await createStep06Fixture({
      platformMembershipAdministrationService: service
    } as never);
    fixture.roles[0].rolePermissions.push(
      ...["backoffice:membership-tier:read", "backoffice:membership-benefit:read"].map(
        (code, index) => ({
          id: 9_200 + index,
          roleId: fixture.roles[0].id,
          permissionId: 9_200 + index,
          deletedAt: null,
          permission: {
            id: 9_200 + index,
            name: code,
            code,
            type: "api" as const,
            module: "backoffice",
            description: code,
            isSystem: true,
            createdAt: new Date("2026-09-01T12:00:00.000Z"),
            updatedAt: new Date("2026-09-01T12:00:00.000Z"),
            deletedAt: null
          }
        })
      )
    );
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/membership-tiers")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/backoffice/membership-benefits")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/membership-tiers/gold/publish")
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedVersion: 2, expectedLockVersion: 1 })
      .expect(403);
    await request(fixture.app)
      .patch("/api/v1/backoffice/membership-benefits/ndp_experience")
      .set("Authorization", `Bearer ${token}`)
      .send({ isGloballyEnabled: false, expectedLockVersion: 1 })
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/backoffice/users/42/platform-membership")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "grant",
        targetTierCode: "gold",
        billingCycle: "monthly",
        source: "operations",
        sourceReference: "ops:user:42:membership:1",
        expectedCurrentLockVersion: null
      })
      .expect(403);
  });
});
