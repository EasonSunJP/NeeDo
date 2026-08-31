import request from "supertest";
import { AppError } from "../src/utils/app-error";
import { ERROR_CODES } from "../src/constants/error-codes";
import { createStep06Fixture } from "./helpers/step06-fixture";

const grant = (
  fixture: Awaited<ReturnType<typeof createStep06Fixture>>,
  codes: string[]
) => {
  fixture.roles[0].rolePermissions.push(
    ...codes.map((code, index) => ({
      id: 9_300 + index,
      roleId: fixture.roles[0].id,
      permissionId: 9_300 + index,
      deletedAt: null,
      permission: {
        id: 9_300 + index,
        name: code,
        code,
        type: "api" as const,
        module: "backoffice",
        description: code,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      }
    }))
  );
};

describe("backoffice user group API", () => {
  it("returns paginated groups and members and forwards canonical member IDs", async () => {
    const service = {
      listGroups: jest.fn(async () => ({
        list: [{ code: "system:free", mutableName: false }],
        total: 5,
        page: 1,
        page_size: 20
      })),
      listGroupMembers: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
      createCustomGroup: jest.fn(),
      updateCustomGroup: jest.fn(),
      archiveCustomGroup: jest.fn(),
      setCustomGroupMembers: jest.fn(async () => ({
        kind: "updated",
        added: 2,
        removed: 0,
        unchanged: 0
      }))
    };
    const fixture = await createStep06Fixture({ backofficeUserGroupService: service } as never);
    grant(fixture, ["backoffice:user-group:read", "backoffice:user-group:write"]);
    const token = await fixture.loginAsAdmin();

    const groups = await request(fixture.app)
      .get("/api/v1/backoffice/user-groups?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(groups.body.data).toMatchObject({ total: 5, page: 1, page_size: 20 });

    await request(fixture.app)
      .put("/api/v1/backoffice/user-groups/custom%3Agroup-1/members")
      .set("Authorization", `Bearer ${token}`)
      .send({ userIds: ["u0000000001", "u0000000002"], reason: "campaign cohort" })
      .expect(200);
    expect(service.setCustomGroupMembers).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "custom:group-1",
      { userIds: ["u0000000001", "u0000000002"], reason: "campaign cohort" }
    );
  });

  it("returns 422 for system-group mutation and 403 without write permission", async () => {
    const service = {
      listGroups: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
      listGroupMembers: jest.fn(),
      createCustomGroup: jest.fn(),
      updateCustomGroup: jest.fn(async () => {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.backoffice_user_group.system_group_immutable",
          statusCode: 422
        });
      }),
      archiveCustomGroup: jest.fn(),
      setCustomGroupMembers: jest.fn()
    };
    const fixture = await createStep06Fixture({ backofficeUserGroupService: service } as never);
    grant(fixture, ["backoffice:user-group:read", "backoffice:user-group:write"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/user-groups/system%3Afree")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "不可修改", description: null })
      .expect(422);

    fixture.roles[0].rolePermissions = fixture.roles[0].rolePermissions.filter(
      (assignment) => assignment.permission.code !== "backoffice:user-group:write"
    );
    const readOnlyToken = await fixture.loginAsAdmin();
    await request(fixture.app)
      .post("/api/v1/backoffice/user-groups")
      .set("Authorization", `Bearer ${readOnlyToken}`)
      .send({ name: "VIP", description: null })
      .expect(403);
  });
});
