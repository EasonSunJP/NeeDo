import type { PrismaClient } from "@prisma/client";
import { AffiliateIdentityActivationRepository } from "../src/repositories/affiliate-identity-activation.repository";

const acceptedAt = new Date("2026-08-26T05:00:00.000Z");
const input = {
  userId: 7,
  sessionId: "access-jti-7",
  acceptedAt,
  receiptId: "receipt-91",
  contract: {
    type: "affiliate" as const,
    version: "affiliate-2026-08-26-v1",
    effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
    language: "zh-CN",
    text: "NeeDo 联盟营销规则及合同完整文本",
    contentHash: "a".repeat(64)
  }
};

describe("AffiliateIdentityActivationRepository", () => {
  it("persists immutable contract evidence and activates the role in one transaction", async () => {
    const tx = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 7, needoId: "u0000000007", username: "山本太郎" })
      },
      contractAcceptance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 91,
          acceptedByUserId: 7,
          contractType: "affiliate",
          contractVersion: input.contract.version,
          contentHash: input.contract.contentHash,
          acceptedAt,
          receiptId: "receipt-91"
        })
      },
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 81,
          userId: 7,
          type: "scout",
          scopeType: "global",
          scopeId: null
        })
      },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 6, code: "scout" }) },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 71 })
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 61 }) },
      affiliateProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 101, status: "ACTIVE" })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 51 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new AffiliateIdentityActivationRepository(client);

    await expect(repository.activateWithContractInTransaction(input)).resolves.toMatchObject({
      contractAcceptance: { id: 91, receiptId: "receipt-91" },
      affiliate: {
        affiliateStatus: "active",
        needoId: "u0000000007",
        profileId: 101
      }
    });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contractAcceptance.create).toHaveBeenCalledWith({
      data: {
        acceptedByUserId: 7,
        identityApplicationId: null,
        contractType: "affiliate",
        contractVersion: input.contract.version,
        effectiveAt: input.contract.effectiveAt,
        acceptedTextSnapshot: input.contract.text,
        contentHash: input.contract.contentHash,
        acceptedAt,
        language: "zh-CN",
        sessionId: "access-jti-7",
        receiptId: "receipt-91",
        acceptanceKey: "7:affiliate:affiliate-2026-08-26-v1"
      }
    });
    expect(tx.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "scout",
        activeKey: "identity-activation:7:scout:contract:91",
        isActive: true
      })
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipientUserId: 7, type: "SYSTEM" })
    });
    expect(tx.affiliateProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 7 },
      create: { userId: 7 },
      update: {},
      select: { id: true, status: true }
    });
    const contractAudit = tx.auditLog.create.mock.calls.find(
      ([call]) => call.data.action === "contract.acceptance.created"
    )?.[0];
    expect(contractAudit).toEqual({
      data: expect.objectContaining({
        actorId: 7,
        targetId: 91,
        ip: null,
        metadata: {
          contractType: "affiliate",
          contractVersion: input.contract.version,
          contentHash: input.contract.contentHash,
          receiptId: "receipt-91"
        }
      })
    });
    expect(JSON.stringify(tx.contractAcceptance.create.mock.calls[0]?.[0])).not.toContain(
      "ipAddress"
    );
  });

  it("returns the existing contract and identity without duplicate role or notification writes", async () => {
    const existingAcceptance = {
      id: 91,
      acceptedByUserId: 7,
      contractType: "affiliate",
      contractVersion: input.contract.version,
      contentHash: input.contract.contentHash,
      acceptedAt,
      receiptId: "receipt-existing"
    };
    const tx = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 7, needoId: "u0000000007", username: "山本太郎" })
      },
      contractAcceptance: {
        findUnique: jest.fn().mockResolvedValue(existingAcceptance),
        create: jest.fn()
      },
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue({
          id: 81,
          userId: 7,
          type: "scout",
          scopeType: "global",
          scopeId: null
        }),
        create: jest.fn()
      },
      role: { findFirst: jest.fn() },
      userRole: { findFirst: jest.fn(), create: jest.fn() },
      notification: { create: jest.fn() },
      affiliateProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 101, status: "ACTIVE" })
      },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new AffiliateIdentityActivationRepository(client);

    await expect(repository.activateWithContractInTransaction(input)).resolves.toMatchObject({
      contractAcceptance: { receiptId: "receipt-existing" },
      affiliate: {
        affiliateStatus: "active",
        needoId: "u0000000007",
        profileId: 101
      }
    });
    expect(tx.contractAcceptance.create).not.toHaveBeenCalled();
    expect(tx.userIdentity.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.affiliateProfile.upsert).toHaveBeenCalledTimes(1);
  });
});
