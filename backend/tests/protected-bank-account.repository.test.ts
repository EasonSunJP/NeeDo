import type { PrismaClient } from "@prisma/client";
import { ProtectedBankAccountRepository } from "../src/repositories/protected-bank-account.repository";

const verifiedAt = new Date("2026-08-26T05:00:00.000Z");

describe("ProtectedBankAccountRepository", () => {
  it("loads only a usable verified eKYC record with the merchant draft", async () => {
    const identityApplication = {
      findFirst: jest.fn().mockResolvedValue({
        id: 11,
        userId: 7,
        status: "draft",
        version: 1,
        merchantDetail: {
          applicantKind: "individual",
          corporateLegalNameKana: null,
          bankAccountId: null
        },
        applicant: {
          ekycVerifications: [{ verifiedNameKanaEncrypted: "v1.encrypted" }]
        }
      })
    };
    const client = { identityApplication } as unknown as PrismaClient;
    const repository = new ProtectedBankAccountRepository(client);

    await expect(repository.findMerchantBindingContext(11, verifiedAt)).resolves.toMatchObject({
      applicationId: 11,
      userId: 7,
      applicantKind: "individual",
      verifiedEkycNameKanaEncrypted: "v1.encrypted"
    });
    expect(identityApplication.findFirst).toHaveBeenCalledWith({
      where: { id: 11, type: "merchant", deletedAt: null },
      select: expect.objectContaining({
        applicant: {
          select: {
            ekycVerifications: {
              where: {
                status: "verified",
                deletedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: verifiedAt } }]
              },
              orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { verifiedNameKanaEncrypted: true }
            }
          }
        }
      })
    });
  });

  it.each(["ordinary", "current", "savings", "other"] as const)("persists %s, binds, versions and audits without raw values in one transaction", async (accountType) => {
    const tx = {
      identityApplication: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      protectedBankAccount: {
        create: jest.fn().mockResolvedValue({
          id: 44,
          bankCode: "0005",
          bankName: "三菱UFJ银行",
          branchCode: "001",
          branchName: "本店",
          accountType,
          verifiedAt
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      merchantApplicationDetail: {
        update: jest.fn().mockResolvedValue({ id: 4 })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 81 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new ProtectedBankAccountRepository(client);

    await expect(
      repository.bindVerifiedMerchantAccount({
        userId: 7,
        applicationId: 11,
        expectedVersion: 1,
        previousBankAccountId: 40,
        bankCode: "0005",
        bankName: "三菱UFJ银行",
        branchCode: "001",
        branchName: "本店",
        accountType,
        accountNumberEncrypted: "v1.account",
        accountHolderEncrypted: "v1.holder",
        accountHolderNormalizedEncrypted: "v1.normalized",
        holderMatchHash: "a".repeat(64),
        verificationSource: "ekyc",
        verificationStatus: "verified",
        verifiedAt,
        auditMetadata: {
          applicationId: 11,
          applicantKind: "individual",
          verificationStatus: "verified"
        }
      })
    ).resolves.toMatchObject({ id: 44, applicationVersion: 2 });

    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: 11,
        userId: 7,
        version: 1,
        status: { in: ["draft", "rejected"] },
        deletedAt: null
      },
      data: { version: { increment: 1 } }
    });
    expect(tx.protectedBankAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 7,
        purpose: "merchant_application",
        accountType,
        accountNumberEncrypted: "v1.account",
        accountHolderEncrypted: "v1.holder"
      })
    });
    expect(tx.protectedBankAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 40, ownerUserId: 7, deletedAt: null },
      data: { deletedAt: verifiedAt }
    });
    expect(tx.merchantApplicationDetail.update).toHaveBeenCalledWith({
      where: { applicationId: 11 },
      data: { bankAccountId: 44 }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        action: "identity_application.bank_account.bound",
        targetType: "ProtectedBankAccount",
        targetId: 44,
        ip: null
      })
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls[0]?.[0])).not.toContain("v1.account");
    expect(JSON.stringify(tx.auditLog.create.mock.calls[0]?.[0])).not.toContain("v1.holder");
  });
});
