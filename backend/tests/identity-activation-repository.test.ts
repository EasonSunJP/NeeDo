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
      data: expect.objectContaining({ recipientUserId: 3, actorUserId: 8, type: "SYSTEM" })
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
});
