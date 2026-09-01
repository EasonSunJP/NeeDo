import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { IdentityActivationRepository } from "../src/repositories/identity-activation.repository";

describe("IdentityActivationRepository", () => {
  it("adds a unique active key to formal identities", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const identity = schema.match(/model UserIdentity \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(identity).toMatch(/activeKey\s+String\?\s+@unique/);
  });

  it("finds only active, non-deleted formal identities", async () => {
    const userIdentity = {
      findFirst: jest.fn().mockResolvedValue({
        id: 91,
        userId: 3,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 21
      })
    };
    const client = { userIdentity } as unknown as PrismaClient;
    const repository = new IdentityActivationRepository(client);

    await expect(repository.findActiveIdentity(3, "technician")).resolves.toMatchObject({
      identityId: 91,
      roleCode: "technician",
      scopeId: 21
    });
    expect(userIdentity.findFirst).toHaveBeenCalledWith({
      where: { userId: 3, type: "technician", isActive: true, deletedAt: null }
    });
  });

  it("creates identity, role assignment, system notification, and audit in one transaction", async () => {
    const tx = {
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, code: "technician" })
      },
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue({ id: 108 }),
        create: jest.fn().mockResolvedValue({
          id: 91,
          userId: 3,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 21
        })
      },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 44 })
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 71 })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 81 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new IdentityActivationRepository(client);
    const activatedAt = new Date("2026-08-26T05:00:00.000Z");

    await repository.activateInTransaction({
      userId: 3,
      actorUserId: 8,
      identityType: "technician",
      roleCode: "technician",
      scopeType: "technician_profile",
      scopeId: 21,
      displayName: "山本太郎",
      applicationId: 11,
      contractAcceptanceId: null,
      activatedAt,
      notificationPayload: { identityKind: "technician" },
      auditMetadata: { applicationId: 11 },
      idempotencyKey: "identity-activation:3:technician:application:11"
    });

    expect(tx.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 3,
        type: "technician",
        activeKey: "identity-activation:3:technician:application:11",
        isActive: true
      })
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 3, roleId: 6, scopeType: "technician_profile", scopeId: 21 }
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 3,
        recipientIdentityId: 91,
        actorUserId: 8,
        actorIdentityId: 108,
        type: "SYSTEM"
      })
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 8,
        action: "identity.activation.completed",
        targetType: "UserIdentity",
        targetId: 91,
        ip: null
      })
    });
  });

  it("creates an independent identity card in the same merchant activation transaction", async () => {
    const tx = {
      role: { findFirst: jest.fn().mockResolvedValue({ id: 5, code: "merchant_owner" }) },
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue({ id: 109 }),
        create: jest.fn().mockResolvedValue({
          id: 92,
          userId: 4,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 73
        })
      },
      merchantIdentityProfile: { create: jest.fn().mockResolvedValue({ id: 62 }) },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 45 })
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 72 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 82 }) }
    };
    const repository = new IdentityActivationRepository({} as PrismaClient);

    await repository.activateWithTransaction(tx as never, {
      userId: 4,
      actorUserId: 8,
      identityType: "merchant_owner",
      roleCode: "merchant_owner",
      scopeType: "shop",
      scopeId: 73,
      displayName: "佐藤 美咲",
      applicationId: 12,
      contractAcceptanceId: null,
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      notificationPayload: { identityKind: "merchant" },
      auditMetadata: { applicationId: 12 },
      idempotencyKey: "identity-activation:4:merchant_owner:application:12"
    });

    expect(tx.merchantIdentityProfile.create).toHaveBeenCalledWith({
      data: { userId: 4, identityId: 92, displayName: "佐藤 美咲", languages: [] }
    });
  });
});
