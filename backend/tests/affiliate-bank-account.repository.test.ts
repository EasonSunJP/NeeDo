import type { PrismaClient } from "@prisma/client";
import { AffiliateBankAccountRepository } from "../src/repositories/affiliate-bank-account.repository";

const verifiedAt = new Date("2026-08-26T05:00:00.000Z");

describe("AffiliateBankAccountRepository", () => {
  it("replaces the prior withdrawal account and audits only non-sensitive metadata atomically", async () => {
    const tx = {
      protectedBankAccount: {
        create: jest.fn().mockResolvedValue({
          id: 21,
          bankCode: "0001",
          bankName: "みずほ銀行",
          branchCode: "001",
          branchName: "銀座支店",
          accountType: "ordinary"
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 31 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new AffiliateBankAccountRepository(client);

    await repository.bindVerifiedAccount({
      userId: 7,
      previousBankAccountId: 20,
      purpose: "affiliate_withdrawal",
      bankCode: "0001",
      bankName: "みずほ銀行",
      branchCode: "001",
      branchName: "銀座支店",
      accountType: "ordinary",
      accountNumberEncrypted: "v1.encrypted-number",
      accountHolderEncrypted: "v1.encrypted-holder",
      accountHolderNormalizedEncrypted: "v1.encrypted-normalized",
      holderMatchHash: "a".repeat(64),
      verificationSource: "ekyc",
      verificationStatus: "verified",
      verifiedAt,
      auditMetadata: { purpose: "affiliate_withdrawal", verificationStatus: "verified" }
    });

    expect(tx.protectedBankAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerUserId: 7, purpose: "affiliate_withdrawal" })
    });
    expect(tx.protectedBankAccount.updateMany).toHaveBeenCalledWith({
      where: {
        id: 20,
        ownerUserId: 7,
        purpose: "affiliate_withdrawal",
        deletedAt: null
      },
      data: { deletedAt: verifiedAt }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 7,
        action: "affiliate.withdrawal.bank_account.bound",
        targetType: "ProtectedBankAccount",
        targetId: 21,
        ip: null,
        userAgent: null,
        metadata: { purpose: "affiliate_withdrawal", verificationStatus: "verified" },
        createdAt: verifiedAt
      }
    });
  });
});
