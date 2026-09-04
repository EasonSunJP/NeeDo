import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateBankAccountRepositoryPort,
  AffiliateBankBindingContext,
  BindVerifiedAffiliateBankAccountRepositoryInput,
  BoundAffiliateBankAccountRecord
} from "../services/affiliate-bank-account.service";

export class AffiliateBankAccountRepository implements AffiliateBankAccountRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findBindingContext(
    userId: number,
    now: Date
  ): Promise<AffiliateBankBindingContext | null> {
    const user = await this.client.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        identities: {
          where: { type: "scout", isActive: true, deletedAt: null },
          take: 1,
          select: { id: true }
        },
        ekycVerifications: {
          where: {
            status: "verified",
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
          },
          orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { verifiedNameKanaEncrypted: true }
        },
        protectedBankAccounts: {
          where: { purpose: "affiliate_withdrawal", deletedAt: null },
          orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true }
        }
      }
    });
    if (!user) {
      return null;
    }
    return {
      userId,
      affiliateIdentityActive: user.identities.length > 0,
      verifiedEkycNameKanaEncrypted: user.ekycVerifications[0]?.verifiedNameKanaEncrypted ?? null,
      previousBankAccountId: user.protectedBankAccounts[0]?.id ?? null
    };
  }

  public bindVerifiedAccount(
    input: BindVerifiedAffiliateBankAccountRepositoryInput
  ): Promise<BoundAffiliateBankAccountRecord> {
    return this.client.$transaction(async (transaction) => {
      const account = await transaction.protectedBankAccount.create({
        data: {
          ownerUserId: input.userId,
          purpose: input.purpose,
          bankCode: input.bankCode,
          bankName: input.bankName,
          branchCode: input.branchCode,
          branchName: input.branchName,
          accountType: input.accountType,
          accountNumberEncrypted: input.accountNumberEncrypted,
          accountHolderEncrypted: input.accountHolderEncrypted,
          accountHolderNormalizedEncrypted: input.accountHolderNormalizedEncrypted,
          holderMatchHash: input.holderMatchHash,
          verificationSource: input.verificationSource,
          verificationStatus: input.verificationStatus,
          verifiedAt: input.verifiedAt
        }
      });
      if (input.previousBankAccountId !== null) {
        await transaction.protectedBankAccount.updateMany({
          where: {
            id: input.previousBankAccountId,
            ownerUserId: input.userId,
            purpose: "affiliate_withdrawal",
            deletedAt: null
          },
          data: { deletedAt: input.verifiedAt }
        });
      }
      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: "affiliate.withdrawal.bank_account.bound",
          targetType: "ProtectedBankAccount",
          targetId: account.id,
          ip: null,
          userAgent: null,
          metadata: input.auditMetadata as Prisma.InputJsonValue,
          createdAt: input.verifiedAt
        }
      });
      return {
        id: account.id,
        bankCode: account.bankCode,
        bankName: account.bankName,
        branchCode: account.branchCode,
        branchName: account.branchName,
        accountType: account.accountType,
        verifiedAt: input.verifiedAt
      };
    });
  }
}
