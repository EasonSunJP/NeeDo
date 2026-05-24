import request from "supertest";
import { ERROR_CODES } from "../src/constants/error-codes";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("Step 06 Role API", () => {
  it("lists, creates, updates, and soft deletes roles while protecting system roles", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const listResponse = await request(fixture.app)
      .get("/api/v1/roles?page=1&pageSize=2")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(listResponse.body.data).toEqual({
      list: [
        expect.objectContaining({ id: 1, code: "admin", isSystem: true }),
        expect.objectContaining({ id: 2, code: "operator", isSystem: true })
      ],
      total: 3,
      page: 1,
      page_size: 2
    });

    const createResponse = await request(fixture.app)
      .post("/api/v1/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Report Manager",
        code: "report_manager",
        description: "Can manage report exports"
      })
      .expect(201);

    expect(createResponse.body.data).toMatchObject({
      id: 4,
      name: "Report Manager",
      code: "report_manager",
      isSystem: false,
      permissions: []
    });

    const updateResponse = await request(fixture.app)
      .patch("/api/v1/roles/4")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Report Ops", description: null })
      .expect(200);

    expect(updateResponse.body.data).toMatchObject({
      id: 4,
      name: "Report Ops",
      description: null
    });

    await request(fixture.app)
      .delete("/api/v1/roles/1")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.CANNOT_DELETE_SYSTEM);
      });

    await request(fixture.app)
      .delete("/api/v1/roles/4")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(fixture.roles.find((role) => role.id === 4)?.deletedAt).toEqual(expect.any(Date));
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "role.create", targetType: "Role", targetId: 4 }),
        expect.objectContaining({ action: "role.update", targetType: "Role", targetId: 4 }),
        expect.objectContaining({ action: "role.delete", targetType: "Role", targetId: 4 })
      ])
    );
  });

  it("assigns role permissions atomically and writes an audit log", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .put("/api/v1/roles/3/permissions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ permissionIds: [1, 3, 5] })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: 3,
      code: "custom_manager",
      permissions: [
        expect.objectContaining({ id: 1, code: "permission:list" }),
        expect.objectContaining({ id: 3, code: "custom:read" }),
        expect.objectContaining({ id: 5, code: "user:list" })
      ]
    });
    expect(fixture.permissionAssignCalls).toEqual([{ roleId: 3, permissionIds: [1, 3, 5] }]);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "role.assign_permission",
          targetType: "Role",
          targetId: 3,
          metadata: { permissionIds: [1, 3, 5] }
        })
      ])
    );
  });
});
