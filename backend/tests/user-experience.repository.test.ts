import {
  PlatformMembershipTierCode,
  UserExperienceEventType,
  type PrismaClient
} from "@prisma/client";
import type { UserExperienceCalculatedEvent } from "../src/domain/user-experience";
import { UserExperienceRepository } from "../src/repositories/user-experience.repository";

const occurredAt = new Date("2026-09-01T00:00:00.000Z");
const calculatedEvent: UserExperienceCalculatedEvent = {
  userId: 41,
  eventType: "service_completed",
  sourceType: "booking_order",
  sourcePublicId: "order-1",
  idempotencyKey: "service-completed:order-1",
  baseUnits: 100_000n,
  campaignFactorBps: 10_000,
  membershipMultiplierBps: 20_000,
  extraUnits: 0n,
  finalUnits: 200_000n,
  membershipTierCode: "silver",
  membershipTierVersionId: "tier-version-1",
  policyVersionId: null,
  campaignVersionId: null,
  occurredAt,
  reversalOfEntryId: null
};

const account = {
  id: 9,
  publicId: "experience-account-41",
  userId: 41,
  totalExpUnits: 0n,
  currentLevel: 1,
  lockVersion: 1
};

const entry = {
  publicId: "experience-entry-1",
  userId: 41,
  eventType: UserExperienceEventType.SERVICE_COMPLETED,
  sourceType: "booking_order",
  sourcePublicId: "order-1",
  idempotencyKey: "service-completed:order-1",
  baseUnits: 100_000n,
  campaignFactorBps: 10_000,
  membershipMultiplierBps: 20_000,
  extraUnits: 0n,
  finalUnits: 200_000n,
  membershipTierCode: PlatformMembershipTierCode.SILVER,
  membershipTierVersionId: "tier-version-1",
  policyVersionId: null,
  campaignVersionId: null,
  occurredAt,
  reversalOfEntryId: null
};

describe("UserExperienceRepository", () => {
  it("paginates active entries newest first without returning internal account ids", async () => {
    const client = {
      userExperienceEntry: {
        findMany: jest.fn(async () => [entry]),
        count: jest.fn(async () => 1)
      }
    };
    const repository = new UserExperienceRepository(client as unknown as PrismaClient);

    await expect(repository.listEntries(41, { page: 2, pageSize: 5 })).resolves.toEqual({
      list: [expect.objectContaining({ publicId: "experience-entry-1", userId: 41 })],
      total: 1,
      page: 2,
      page_size: 5
    });
    expect(client.userExperienceEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 41, deletedAt: null },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: 5,
        take: 5
      })
    );
  });

  it("retries a rolled-back optimistic account conflict and preserves the immutable snapshot", async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const transaction = {
      userExperienceEntry: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => entry)
      },
      userExperienceAccount: {
        findFirst: jest.fn(async () => account),
        updateMany
      }
    };
    const client = {
      $transaction: jest.fn(async (handler: (tx: typeof transaction) => unknown) =>
        handler(transaction)
      ),
      userExperienceEntry: { findUnique: jest.fn() },
      userExperienceAccount: { findFirst: jest.fn() }
    };
    const repository = new UserExperienceRepository(client as unknown as PrismaClient);

    await expect(repository.recordCalculatedEvent(calculatedEvent)).resolves.toMatchObject({
      status: "awarded",
      account: { totalUnits: 200_000n, lockVersion: 2 },
      entry: {
        baseUnits: 100_000n,
        membershipMultiplierBps: 20_000,
        finalUnits: 200_000n
      }
    });
    expect(client.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.userExperienceEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: UserExperienceEventType.SERVICE_COMPLETED,
          membershipTierCode: PlatformMembershipTierCode.SILVER
        })
      })
    );
  });

  it("returns the existing entry for a duplicate idempotency key without mutation", async () => {
    const transaction = {
      userExperienceEntry: {
        findUnique: jest.fn(async () => entry),
        create: jest.fn()
      },
      userExperienceAccount: {
        findFirst: jest.fn(async () => account),
        updateMany: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (handler: (tx: typeof transaction) => unknown) =>
        handler(transaction)
      )
    };
    const repository = new UserExperienceRepository(client as unknown as PrismaClient);

    await expect(repository.recordCalculatedEvent(calculatedEvent)).resolves.toMatchObject({
      status: "duplicate",
      entry: { publicId: "experience-entry-1" }
    });
    expect(transaction.userExperienceEntry.create).not.toHaveBeenCalled();
    expect(transaction.userExperienceAccount.updateMany).not.toHaveBeenCalled();
  });
});
