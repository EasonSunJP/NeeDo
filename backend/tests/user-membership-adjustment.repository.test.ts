import { PlatformMembershipTierCode } from "@prisma/client";
import { PlatformMembershipRepository } from "../src/repositories/platform-membership.repository";

const now = new Date("2026-09-06T00:00:00.000Z");

function fixture(current: null | {
  id: number;
  lockVersion: number;
  tierVersionId: number | null;
  multiplierBps: number | null;
  tierVersion: null | { tier: { code: PlatformMembershipTierCode } };
} = null) {
  const adjustmentCreate = jest.fn(async () => ({ id: 71 }));
  const adjustmentUpdateMany = jest.fn(async () => ({ count: 1 }));
  const auditCreate = jest.fn(async () => ({}));
  const transaction = {
    $queryRaw: jest.fn(async () => [{ id: 6 }]),
    userMembershipAdjustment: {
      findFirst: jest.fn(async () => current),
      updateMany: adjustmentUpdateMany,
      create: adjustmentCreate,
    },
    platformMembershipTierVersion: {
      findFirst: jest.fn(async () => ({ id: 18 })),
    },
    auditLog: { create: auditCreate },
  };
  const client = {
    $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    repository: new PlatformMembershipRepository(client as never, () => now),
    transaction,
    adjustmentCreate,
    adjustmentUpdateMany,
    auditCreate,
  };
}

describe("PlatformMembershipRepository user membership adjustment", () => {
  it("locks the account, supersedes the old row, and persists a complete successor", async () => {
    const test = fixture({
      id: 70,
      lockVersion: 2,
      tierVersionId: 15,
      multiplierBps: 11_000,
      tierVersion: { tier: { code: PlatformMembershipTierCode.SILVER } },
    });

    await expect(
      test.repository.adjustUserMembershipWithAudit({
        actorId: 9,
        userId: 41,
        multiplierBps: 12_500,
        reason: "Approved retention adjustment",
        expectedLockVersion: 2,
        effectiveFrom: now,
        audit: {
          actorId: 9,
          action: "platform.user_membership.adjust",
          targetType: "UserMembershipAdjustment",
        },
      }),
    ).resolves.toEqual({
      kind: "adjusted",
      value: {
        tierCode: "silver",
        multiplier: 1.25,
        lockVersion: 3,
        effectiveFrom: now,
      },
    });
    expect(test.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(test.adjustmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 70, lockVersion: 2 }),
        data: { supersededAt: now },
      }),
    );
    expect(test.adjustmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 41,
          tierVersionId: 15,
          multiplierBps: 12_500,
          reason: "Approved retention adjustment",
          expectedLockVersion: 2,
          lockVersion: 3,
          createdById: 9,
        }),
      }),
    );
    expect(test.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("adjusts an existing account even before it has a customer profile", async () => {
    const test = fixture();
    test.transaction.$queryRaw.mockImplementation(async (...args: unknown[]) => {
      const query = args[0] as { sql: string };
      return /FROM users WHERE id =/.test(query.sql) ? [{ id: 41 }] : [];
    });
    const result = await test.repository.adjustUserMembershipWithAudit({
      actorId: 9, userId: 41, tierCode: "gold", reason: "Approved account membership",
      expectedLockVersion: null, effectiveFrom: now,
      audit: { actorId: 9, action: "platform.user_membership.adjust", targetType: "UserMembershipAdjustment" }
    });
    expect(result.kind).toBe("adjusted");
    expect(test.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale expected version before changing history", async () => {
    const test = fixture({
      id: 70,
      lockVersion: 3,
      tierVersionId: null,
      multiplierBps: 12_500,
      tierVersion: null,
    });

    await expect(
      test.repository.adjustUserMembershipWithAudit({
        actorId: 9,
        userId: 41,
        tierCode: "gold",
        reason: "Approved tier adjustment",
        expectedLockVersion: 2,
        effectiveFrom: now,
        audit: { actorId: 9, action: "adjust", targetType: "membership" },
      }),
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(test.adjustmentUpdateMany).not.toHaveBeenCalled();
    expect(test.adjustmentCreate).not.toHaveBeenCalled();
    expect(test.auditCreate).not.toHaveBeenCalled();
  });
});
