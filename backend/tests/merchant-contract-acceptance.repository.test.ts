import type { PrismaClient } from "@prisma/client";
import { MerchantContractAcceptanceRepository } from "../src/repositories/merchant-contract-acceptance.repository";

const now = new Date("2026-08-26T05:00:00.000Z");

describe("MerchantContractAcceptanceRepository", () => {
  it("creates immutable evidence, binds it, increments the draft version, and audits atomically", async () => {
    const tx = {
      contractAcceptance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 91,
          contractVersion: "merchant-2026-08-26-v1",
          contentHash: "a".repeat(64),
          acceptedAt: now,
          receiptId: "receipt-91"
        })
      },
      identityApplication: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      merchantApplicationDetail: { update: jest.fn().mockResolvedValue({ id: 51 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 101 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new MerchantContractAcceptanceRepository(client);

    await expect(
      repository.acceptAndBindInTransaction({
        userId: 7,
        applicationId: 41,
        expectedVersion: 3,
        sessionId: "access-jti-7",
        acceptedAt: now,
        receiptId: "receipt-91",
        contract: {
          type: "merchant",
          version: "merchant-2026-08-26-v1",
          effectiveAt: new Date("2026-08-26T00:00:00.000Z"),
          language: "zh-CN",
          text: "NeeDo 商户服务规则及合同完整文本",
          contentHash: "a".repeat(64)
        }
      })
    ).resolves.toMatchObject({ id: 91, applicationId: 41, applicationVersion: 4 });
    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: 41,
        userId: 7,
        type: "merchant",
        version: 3,
        status: { in: ["draft", "rejected"] },
        deletedAt: null,
        merchantDetail: { deletedAt: null }
      },
      data: { version: { increment: 1 } }
    });
    expect(tx.merchantApplicationDetail.update).toHaveBeenCalledWith({
      where: { applicationId: 41 },
      data: { contractAcceptanceId: 91 }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        action: "identity_application.merchant.contract.accepted",
        targetId: 41,
        ip: null,
        metadata: {
          applicationId: 41,
          contractAcceptanceId: 91,
          contractVersion: "merchant-2026-08-26-v1",
          contentHash: "a".repeat(64),
          receiptId: "receipt-91",
          version: 4
        }
      })
    });
  });
});
