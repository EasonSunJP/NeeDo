import request from "supertest";
import { ERROR_CODES } from "../src/constants/error-codes";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("Step 06 Permission API", () => {
  it("lists permissions with pagination and builds a module/type permission tree", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const listResponse = await request(fixture.app)
      .get("/api/v1/permissions?page=1&pageSize=2")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(listResponse.body).toEqual({
      code: 0,
      message: "success",
      data: {
        list: [
          expect.objectContaining({ id: 1, code: "permission:list", isSystem: true }),
          expect.objectContaining({ id: 2, code: "permission:delete", isSystem: true })
        ],
        total: 6,
        page: 1,
        page_size: 2
      }
    });

    const treeResponse = await request(fixture.app)
      .get("/api/v1/permissions/tree")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(treeResponse.body.data.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "permission",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "api",
              permissions: expect.arrayContaining([
                expect.objectContaining({ code: "permission:list" })
              ])
            })
          ])
        }),
        expect.objectContaining({
          module: "user",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "button",
              permissions: expect.arrayContaining([
                expect.objectContaining({ code: "button:user:create" })
              ])
            })
          ])
        })
      ])
    );
  });

  it("creates, updates, and soft deletes custom permissions while protecting system permissions", async () => {
    const fixture = await createStep06Fixture();
    const accessToken = await fixture.loginAsAdmin();

    const createResponse = await request(fixture.app)
      .post("/api/v1/permissions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Report Export",
        code: "report:export",
        type: "api",
        module: "report",
        description: "Export reports"
      })
      .expect(201);

    expect(createResponse.body.data).toMatchObject({
      id: 7,
      name: "Report Export",
      code: "report:export",
      type: "api",
      module: "report",
      description: "Export reports",
      isSystem: false
    });

    const updateResponse = await request(fixture.app)
      .patch("/api/v1/permissions/7")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Report CSV Export", description: null })
      .expect(200);

    expect(updateResponse.body.data).toMatchObject({
      id: 7,
      name: "Report CSV Export",
      description: null
    });

    await request(fixture.app)
      .delete("/api/v1/permissions/1")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.CANNOT_DELETE_SYSTEM);
      });

    await request(fixture.app)
      .delete("/api/v1/permissions/7")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(fixture.permissions.find((permission) => permission.id === 7)?.deletedAt).toEqual(
      expect.any(Date)
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "permission.create",
          targetType: "Permission",
          targetId: 7
        }),
        expect.objectContaining({
          actorId: 1,
          action: "permission.update",
          targetType: "Permission",
          targetId: 7
        }),
        expect.objectContaining({
          actorId: 1,
          action: "permission.delete",
          targetType: "Permission",
          targetId: 7
        })
      ])
    );
  });

  it("rejects protected permission APIs when the access token lacks the declared permission", async () => {
    const fixture = await createStep06Fixture();
    fixture.replaceAdminPermissions(["permission:list"]);
    const accessToken = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
      });
  });
});
