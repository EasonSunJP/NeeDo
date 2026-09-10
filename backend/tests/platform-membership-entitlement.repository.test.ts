import {
  PlatformMembershipEntitlementChangeKind,
  PlatformMembershipEntitlementSource,
  PlatformMembershipTierCode
} from "@prisma/client";
import { PlatformMembershipRepository } from "../src/repositories/platform-membership.repository";

const now = new Date("2026-09-01T12:00:00.000Z");
const expiresAt = new Date("2026-10-01T12:00:00.000Z");
const createdRecord = {
  id: 81,
  publicId: "entitlement-silver-1",
  changeKind: PlatformMembershipEntitlementChangeKind.GRANT,
  startsAt: now,
  expiresAt,
  experienceValueNdp: 300,
  tierVersion: {
    publicId: "tier-silver-v1",
    tier: { code: PlatformMembershipTierCode.SILVER }
  }
};
const targetVersion = {
  id: 21,
  publicId: "tier-silver-v1",
  monthlyValueNdp: 300,
  annualBillingMonths: 10,
  durationDays: 30,
  tier: { code: PlatformMembershipTierCode.SILVER }
};
const command = {
  kind: "grant" as const,
  targetTierCode: "silver" as const,
  billingCycle: "monthly" as const,
  source: "operations" as const,
  sourceReference: "ops:membership:42:1",
  expectedCurrentLockVersion: null
};

const createTransaction = (customerLockCount: number) => {
  const entitlementFindFirst = jest
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  const entitlementCreate = jest.fn(async () => createdRecord);
  const entitlementUpdateMany = jest.fn();
  const customerUpdateMany = jest.fn(async () => ({ count: customerLockCount }));
  const auditCreate = jest.fn(async () => ({}));
  const transaction = {
    platformMembershipEntitlement: {
      findFirst: entitlementFindFirst,
      create: entitlementCreate,
      updateMany: entitlementUpdateMany
    },
    customerProfile: {
      findFirst: jest.fn(async () => ({
        id: 7,
        platformMembershipLockVersion: 4
      })),
      updateMany: customerUpdateMany
    },
    platformMembershipTierVersion: {
      findFirst: jest.fn(async () => targetVersion)
    },
    auditLog: { create: auditCreate }
  };
  return {
    transaction,
    entitlementCreate,
    entitlementUpdateMany,
    customerUpdateMany,
    auditCreate
  };
};

describe("PlatformMembershipRepository entitlement changes", () => {
  it("grants a paid entitlement and writes its audit atomically", async () => {
    const fixture = createTransaction(1);
    const client = {
      $transaction: jest.fn(async (callback: (value: typeof fixture.transaction) => unknown) =>
        callback(fixture.transaction)
      )
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.changeEntitlementWithAudit({
        actorId: 9,
        userId: 42,
        occurredAt: now,
        command,
        audit: { actorId: 9, action: "grant", targetType: "membership" }
      })
    ).resolves.toEqual({
      kind: "changed",
      value: {
        kind: "grant",
        tierCode: "silver",
        tierVersionPublicId: "tier-silver-v1",
        entitlementPublicId: "entitlement-silver-1",
        startsAt: now,
        expiresAt,
        experienceValueNdp: 300,
        idempotent: false
      }
    });
    expect(fixture.customerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ platformMembershipLockVersion: 4 }),
        data: { platformMembershipLockVersion: { increment: 1 } }
      })
    );
    expect(fixture.entitlementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: PlatformMembershipEntitlementSource.OPERATIONS,
          changeKind: PlatformMembershipEntitlementChangeKind.GRANT,
          experienceValueNdp: 300,
          createdById: 9
        })
      })
    );
    expect(fixture.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("returns a conflict without creating or auditing when the customer lock is stale", async () => {
    const fixture = createTransaction(0);
    const client = {
      $transaction: jest.fn(async (callback: (value: typeof fixture.transaction) => unknown) =>
        callback(fixture.transaction)
      )
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.changeEntitlementWithAudit({
        actorId: 9,
        userId: 42,
        occurredAt: now,
        command,
        audit: { actorId: 9, action: "grant", targetType: "membership" }
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(fixture.entitlementCreate).not.toHaveBeenCalled();
    expect(fixture.auditCreate).not.toHaveBeenCalled();
  });

  it("returns the original entitlement after an idempotency-key race", async () => {
    const findFirst = jest.fn(async () => createdRecord);
    const client = {
      $transaction: jest.fn(async () => {
        throw { code: "P2002" };
      }),
      platformMembershipEntitlement: { findFirst }
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.changeEntitlementWithAudit({
        actorId: 9,
        userId: 42,
        occurredAt: now,
        command,
        audit: { actorId: 9, action: "grant", targetType: "membership" }
      })
    ).resolves.toMatchObject({
      kind: "idempotent",
      value: { entitlementPublicId: "entitlement-silver-1", idempotent: true }
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 42,
          source: PlatformMembershipEntitlementSource.OPERATIONS,
          sourceReference: "ops:membership:42:1",
          deletedAt: null
        }
      })
    );
  });
});
