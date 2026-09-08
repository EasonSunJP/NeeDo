import { ImPolicyService } from "../src/services/im-policy.service";

const actor = {
  userId: 7,
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  permissions: ["backoffice:system-settings:read", "backoffice:system-settings:write"]
};
const context = { ip: "127.0.0.1", userAgent: "jest" };

const policy = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  version: 1,
  messageDays: 30,
  mediaDays: 3,
  textRetentionSeconds: 2_592_000,
  imageRetentionSeconds: 259_200,
  videoRetentionSeconds: 259_200,
  recallWindowSeconds: 180,
  tracelessRecallMembershipLevels: ["silver", "gold"],
  updatedByUserId: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  ...overrides
});

describe("ImPolicyService", () => {
  it("returns the 30-day message and 3-day media defaults", async () => {
    const service = new ImPolicyService(
      { getActive: jest.fn(async () => policy()), replaceWithAudit: jest.fn() },
      { createInput: jest.fn() } as never
    );

    await expect(service.get(actor as never)).resolves.toMatchObject({
      messageDays: 30,
      mediaDays: 3,
      version: 1
    });
  });

  it("rejects non-positive or non-whole retention days", async () => {
    const service = new ImPolicyService(
      { getActive: jest.fn(async () => policy()), replaceWithAudit: jest.fn() },
      { createInput: jest.fn() } as never
    );

    for (const input of [
      { expectedVersion: 1, messageDays: 0, mediaDays: 3 },
      { expectedVersion: 1, messageDays: 30.5, mediaDays: 3 },
      { expectedVersion: 1, messageDays: 30, mediaDays: -1 }
    ]) {
      await expect(service.update(actor as never, context, input)).rejects.toMatchObject({
        statusCode: 400
      });
    }
  });

  it("creates a versioned prospective policy while preserving lifecycle fields", async () => {
    const repository = {
      getActive: jest.fn(async () => policy()),
      replaceWithAudit: jest.fn(async () => ({
        kind: "updated" as const,
        value: policy({
          id: 2,
          version: 2,
          messageDays: 45,
          mediaDays: 7,
          textRetentionSeconds: 3_888_000,
          imageRetentionSeconds: 604_800,
          videoRetentionSeconds: 604_800,
          updatedByUserId: 7
        })
      }))
    };
    const audit = { createInput: jest.fn(() => ({ action: "audit" })) };
    const service = new ImPolicyService(repository, audit as never);

    await expect(
      service.update(actor as never, context, {
        expectedVersion: 1,
        messageDays: 45,
        mediaDays: 7
      })
    ).resolves.toMatchObject({ messageDays: 45, mediaDays: 7, version: 2 });
    expect(repository.replaceWithAudit).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 1,
      actorUserId: 7,
      messageRetentionSeconds: 3_888_000,
      mediaRetentionSeconds: 604_800,
      audit: { action: "audit" }
    }));
    expect(audit.createInput).toHaveBeenCalledWith(expect.objectContaining({
      action: "backoffice.im_retention.updated",
      metadata: { expectedVersion: 1, changedFields: ["messageDays", "mediaDays"] }
    }));
  });

  it("maps stale versions to a stable conflict", async () => {
    const service = new ImPolicyService(
      {
        getActive: jest.fn(async () => policy()),
        replaceWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const }))
      },
      { createInput: jest.fn(() => ({})) } as never
    );

    await expect(
      service.update(actor as never, context, {
        expectedVersion: 1,
        messageDays: 45,
        mediaDays: 7
      })
    ).rejects.toMatchObject({ statusCode: 409, message: "error.im.policy_version_conflict" });
  });
});
