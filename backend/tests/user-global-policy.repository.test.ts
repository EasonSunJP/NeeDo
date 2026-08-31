import type { PrismaClient } from "@prisma/client";
import { UserGlobalPolicyRepository } from "../src/repositories/user-global-policy.repository";

describe("UserGlobalPolicyRepository", () => {
  it("resolves the latest published version effective at the requested timestamp", async () => {
    const client = {
      userGlobalPolicyVersion: { findFirst: jest.fn(async () => null) }
    };
    const repository = new UserGlobalPolicyRepository(client as unknown as PrismaClient);
    const occurredAt = new Date("2026-12-01T00:00:00Z");

    await repository.resolvePolicyAt(occurredAt);

    expect(client.userGlobalPolicyVersion.findFirst).toHaveBeenCalledWith({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        effectiveFrom: { lte: occurredAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurredAt } }]
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: expect.any(Object)
    });
  });

  it("publishes the draft and audit atomically without mutating an older published row", async () => {
    const transaction = {
      userGlobalPolicyVersion: {
        findFirst: jest.fn(async () => ({
          id: 2,
          publicId: "policy-v2",
          version: 2,
          lockVersion: 1,
          status: "DRAFT",
          effectiveFrom: new Date("2026-09-02T00:00:00Z")
        })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUnique: jest.fn(async () => ({
          publicId: "policy-v2",
          version: 2,
          status: "PUBLISHED",
          lockVersion: 2,
          requirePhone: false,
          requireEmail: false,
          requireHomeServiceEkyc: false,
          requireStoreServiceEkyc: false,
          ndpPerBaseExp: 100,
          baseExpUnitsPerThreshold: 10_000,
          effectiveFrom: new Date("2026-09-02T00:00:00Z"),
          effectiveTo: null,
          publishedAt: new Date("2026-09-01T00:00:00Z")
        }))
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    };
    const repository = new UserGlobalPolicyRepository(client as unknown as PrismaClient);

    await repository.publishDraftWithAudit({
      actorId: 7,
      expectedVersion: 2,
      expectedLockVersion: 1,
      publishedAt: new Date("2026-09-01T00:00:00Z"),
      audit: {
        actorId: 7,
        action: "backoffice.user_global_policy.publish",
        targetType: "UserGlobalPolicyVersion",
        metadata: {}
      }
    });

    expect(transaction.userGlobalPolicyVersion.updateMany).toHaveBeenCalledWith({
      where: { id: 2, status: "DRAFT", lockVersion: 1, deletedAt: null },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date("2026-09-01T00:00:00Z"),
        publishedById: 7,
        lockVersion: { increment: 1 }
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
