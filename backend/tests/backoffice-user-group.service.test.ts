import {
  classifySystemUserGroups,
  type BackofficeUserGroupRepositoryPort
} from "../src/domain/backoffice-user-group";
import { BackofficeUserGroupService } from "../src/services/backoffice-user-group.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actor: AuthenticatedAccessContext = {
  userId: 7,
  email: "operator@needo.local",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 1,
  currentIdentityScopeType: "platform",
  roles: ["operator"],
  permissions: []
};

const context = { ip: "127.0.0.1", userAgent: "jest" };

const makeRepository = () =>
  ({
    countCustomGroups: jest.fn(async () => 1),
    listCustomGroups: jest.fn(async () => [
      {
        code: "custom:group-1",
        kind: "custom",
        name: "常客",
        description: "手动维护",
        status: "active",
        mutableName: true,
        memberCount: 2
      }
    ]),
    countSystemGroupMembers: jest.fn(async () => 0),
    listSystemGroupMembers: jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    })),
    listCustomGroupMembers: jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    })),
    createCustomGroupWithAudit: jest.fn(async () => ({
      kind: "created",
      value: {
        code: "custom:group-2",
        kind: "custom",
        name: "新分组",
        description: null,
        status: "active",
        mutableName: true,
        memberCount: 0
      }
    })),
    updateCustomGroupWithAudit: jest.fn(async () => ({
      kind: "updated",
      value: {
        code: "custom:group-1",
        kind: "custom",
        name: "重点用户",
        description: null,
        status: "active",
        mutableName: true,
        memberCount: 2
      }
    })),
    archiveCustomGroupWithAudit: jest.fn(async () => ({ kind: "archived" })),
    setCustomGroupMembersWithAudit: jest.fn(async () => ({
      kind: "updated",
      added: 1,
      removed: 0,
      unchanged: 1
    }))
  }) as unknown as jest.Mocked<BackofficeUserGroupRepositoryPort>;

describe("BackofficeUserGroupService", () => {
  it("prepends the five immutable derived system groups to custom groups", async () => {
    const repository = makeRepository();
    repository.countSystemGroupMembers
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);
    const service = new BackofficeUserGroupService(
      repository,
      undefined,
      () => new Date("2026-09-01T00:00:00Z")
    );

    await expect(service.listGroups(actor, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: expect.arrayContaining([
        expect.objectContaining({ code: "system:free", mutableName: false, memberCount: 10 }),
        expect.objectContaining({ code: "system:operations", mutableName: false, memberCount: 5 }),
        expect.objectContaining({ code: "custom:group-1", mutableName: true })
      ]),
      total: 6,
      page: 1,
      page_size: 20
    });
  });

  it("classifies an expired paid customer as free and permits operations overlap", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(
      classifySystemUserGroups(
        {
          tierCode: "black_diamond",
          expiresAt: new Date("2026-08-31T23:59:59Z"),
          operationsMember: true
        },
        now
      )
    ).toEqual(["system:free", "system:operations"]);
  });

  it("returns exactly one paid membership group even for an operations member", () => {
    expect(
      classifySystemUserGroups(
        { tierCode: "gold", expiresAt: new Date("2026-10-01T00:00:00Z"), operationsMember: true },
        new Date("2026-09-01T00:00:00Z")
      )
    ).toEqual(["system:gold", "system:operations"]);
  });

  it("rejects manual mutations for system groups", async () => {
    const service = new BackofficeUserGroupService(makeRepository());
    await expect(
      service.setCustomGroupMembers(actor, context, "system:silver", {
        userIds: ["u0000000001"],
        reason: "manual"
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("normalizes duplicate custom members and requires a change reason", async () => {
    const repository = makeRepository();
    const service = new BackofficeUserGroupService(repository, {
      createInput: jest.fn((input) => input)
    } as never);

    await expect(
      service.setCustomGroupMembers(actor, context, "custom:group-1", {
        userIds: ["u0000000002", "u0000000001", "u0000000002"],
        reason: "  campaign cohort  "
      })
    ).resolves.toMatchObject({ added: 1, unchanged: 1 });

    expect(repository.setCustomGroupMembersWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        groupCode: "custom:group-1",
        userIds: ["u0000000001", "u0000000002"],
        reason: "campaign cohort"
      })
    );

    await expect(
      service.archiveCustomGroup(actor, context, "custom:group-1", { reason: " " })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
