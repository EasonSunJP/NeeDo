import request from "supertest";
import { compare } from "bcryptjs";
import { ERROR_CODES } from "../src/constants/error-codes";
import { UserBootstrapKeyAllocationExhaustedError } from "../src/services/user-bootstrap-key.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("Step 06 User API", () => {
  it("lists paginated users by account classification with separate NDP balances", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/users?page=1&pageSize=10&isTestAccount=true")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toMatchObject({ total: 2, page: 1, page_size: 10 });
    expect(response.body.data.list).toEqual([
      expect.objectContaining({
        id: 1,
        isTestAccount: true,
        balances: {
          ndp: { available: 0, frozen: 0 },
          testNdp: { available: 100_000, frozen: 0 }
        }
      }),
      expect.objectContaining({
        id: 3,
        isTestAccount: true,
        balances: {
          ndp: { available: 0, frozen: 0 },
          testNdp: { available: 100_000, frozen: 25 }
        }
      })
    ]);
    expect(fixture.userRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ isTestAccount: true })
    );
  });

  it("changes account classification atomically, calibrates Test NDP, and audits the actor", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();
    const expectedUpdatedAt = fixture.users[1].updatedAt.toISOString();

    const response = await request(fixture.app)
      .patch("/api/v1/users/2/test-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("User-Agent", "NeeDo test account acceptance")
      .send({ isTestAccount: true, expectedUpdatedAt })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: 2,
      isTestAccount: true,
      balances: {
        ndp: { available: 250, frozen: 0 },
        testNdp: { available: 100_000, frozen: 0 }
      }
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "user.test_account.update",
          targetType: "User",
          targetId: 2,
          userAgent: "NeeDo test account acceptance",
          metadata: {
            fromTestAccount: false,
            toTestAccount: true,
            activeCurrency: "NDP",
            expectedUpdatedAt
          }
        })
      ])
    );
  });

  it("rejects stale or financially active classification changes", async () => {
    const staleFixture = await createStep06Fixture();
    const staleToken = await staleFixture.loginAsAdmin();

    await request(staleFixture.app)
      .patch("/api/v1/users/2/test-account")
      .set("Authorization", `Bearer ${staleToken}`)
      .send({ isTestAccount: true, expectedUpdatedAt: "2026-05-24T00:00:00.000Z" })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.ACCOUNT_CLASSIFICATION_STALE,
          message: "error.account_classification.stale"
        });
      });

    const activeFixture = await createStep06Fixture();
    activeFixture.activeFinancialStateUserIds.add(2);
    const activeToken = await activeFixture.loginAsAdmin();

    await request(activeFixture.app)
      .patch("/api/v1/users/2/test-account")
      .set("Authorization", `Bearer ${activeToken}`)
      .send({
        isTestAccount: true,
        expectedUpdatedAt: activeFixture.users[1].updatedAt.toISOString()
      })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.ACCOUNT_CLASSIFICATION_CONFLICT,
          message: "error.account_classification.active_financial_state"
        });
      });
  });

  it("requires the dedicated account-classification permission", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions(["user:list"]);

    await request(fixture.app)
      .patch("/api/v1/users/2/test-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        isTestAccount: true,
        expectedUpdatedAt: fixture.users[1].updatedAt.toISOString()
      })
      .expect(403);
  });

  it("exposes account classification in auth me without embedding wallet balances in tokens", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toEqual(expect.objectContaining({ id: 1, isTestAccount: true }));
    const tokenPayload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")
    );
    expect(tokenPayload).not.toHaveProperty("balances");
    expect(tokenPayload).not.toHaveProperty("isTestAccount");
  });

  it("lists, creates, and updates users without exposing password hashes", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const listResponse = await request(fixture.app)
      .get("/api/v1/users?page=1&pageSize=2")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(listResponse.body.data).toEqual({
      list: [
        expect.objectContaining({ id: 1, email: "admin@example.com", roles: ["admin"] }),
        expect.objectContaining({ id: 2, email: "operator@example.com", roles: ["operator"] })
      ],
      total: 3,
      page: 1,
      page_size: 2
    });
    expect(JSON.stringify(listResponse.body)).not.toContain("passwordHash");

    const createResponse = await request(fixture.app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "new-user@example.com",
        phone: "+819011112222",
        username: "New User",
        password: "Abcd@1234",
        isActive: true
      })
      .expect(201);

    expect(createResponse.body.data).toMatchObject({
      id: 4,
      email: "new-user@example.com",
      phone: "+819011112222",
      username: "New User",
      isActive: true,
      roles: []
    });
    expect(JSON.stringify(createResponse.body)).not.toContain("passwordHash");
    await expect(compare("Abcd@1234", fixture.users[3].passwordHash)).resolves.toBe(true);

    const updateResponse = await request(fixture.app)
      .patch("/api/v1/users/4")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ username: "Updated User", phone: null })
      .expect(200);

    expect(updateResponse.body.data).toMatchObject({
      id: 4,
      username: "Updated User",
      phone: null
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "user.create", targetType: "User", targetId: 4 }),
        expect.objectContaining({ action: "user.update", targetType: "User", targetId: 4 })
      ])
    );
  });

  it("enables, disables, and soft deletes users with self and admin protections", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    await request(fixture.app)
      .post("/api/v1/users/1/disable")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.CANNOT_MODIFY_SELF);
      });

    await request(fixture.app)
      .post("/api/v1/users/2/disable")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(fixture.users[1].isActive).toBe(false);

    await request(fixture.app)
      .post("/api/v1/users/2/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(fixture.users[1].isActive).toBe(true);

    await request(fixture.app)
      .delete("/api/v1/users/3")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.CANNOT_DELETE_SYSTEM);
      });

    await request(fixture.app)
      .delete("/api/v1/users/2")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(fixture.users[1].deletedAt).toEqual(expect.any(Date));
  });

  it("maps exhausted NeeDo ID allocation to a stable protected-create error", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();
    fixture.userRepository.create.mockRejectedValueOnce(new UserBootstrapKeyAllocationExhaustedError());

    await request(fixture.app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "allocation-failure@example.com",
        username: "Allocation Failure",
        password: "Abcd@1234",
        isActive: true
      })
      .expect(503)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.NEEDO_ID_ALLOCATION_UNAVAILABLE,
          message: "error.auth.needo_id_allocation_unavailable"
        });
      });
  });

  it("assigns user roles without allowing the current admin to remove their final admin role", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/users/1/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ roles: [{ roleId: 2, scopeType: "global", scopeId: null }] })
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.CANNOT_MODIFY_SELF);
      });

    const response = await request(fixture.app)
      .put("/api/v1/users/2/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        roles: [
          { roleId: 2, scopeType: "global", scopeId: null },
          { roleId: 3, scopeType: "merchant", scopeId: 99 }
        ]
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: 2,
      roles: ["operator", "custom_manager"]
    });
    expect(fixture.userRoleAssignCalls).toEqual([
      {
        userId: 2,
        roleAssignments: [
          { roleId: 2, scopeType: "global", scopeId: null },
          { roleId: 3, scopeType: "merchant", scopeId: 99 }
        ]
      }
    ]);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "user.assign_role",
          targetType: "User",
          targetId: 2,
          metadata: {
            roles: [
              { roleId: 2, scopeType: "global", scopeId: null },
              { roleId: 3, scopeType: "merchant", scopeId: 99 }
            ]
          }
        })
      ])
    );
  });
});
