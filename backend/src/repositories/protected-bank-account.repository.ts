import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  BindVerifiedMerchantBankAccountRepositoryInput,
  BoundProtectedBankAccountRecord,
  MerchantBankBindingContext,
  ProtectedBankAccountRepositoryPort
} from "../services/protected-bank-account.service";
import { AppError } from "../utils/app-error";

export class ProtectedBankAccountRepository implements ProtectedBankAccountRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findMerchantBindingContext(
    applicationId: number,
    now: Date
  ): Promise<MerchantBankBindingContext | null> {
    const application = await this.client.identityApplication.findFirst({
      where: { id: applicationId, type: "merchant", deletedAt: null },
      select: {
        id: true,
        userId: true,
        status: true,
        version: true,
        merchantDetail: {
          select: {
            applicantKind: true,
            corporateLegalNameKana: true,
            bankAccountId: true
          }
        },
        applicant: {
          select: {
            ekycVerifications: {
              where: {
                status: "verified",
                deletedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
              },
              orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { verifiedNameKanaEncrypted: true }
            }
          }
        }
      }
    });
    if (!application?.merchantDetail) {
      return null;
    }

    return {
      applicationId: application.id,
      userId: application.userId,
      status: application.status,
      version: application.version,
      applicantKind: application.merchantDetail.applicantKind as "corporate" | "individual",
      corporateLegalNameKana: application.merchantDetail.corporateLegalNameKana,
      currentBankAccountId: application.merchantDetail.bankAccountId,
      verifiedEkycNameKanaEncrypted:
        application.applicant.ekycVerifications[0]?.verifiedNameKanaEncrypted ?? null
    };
  }

  public bindVerifiedMerchantAccount(
    input: BindVerifiedMerchantBankAccountRepositoryInput
  ): Promise<BoundProtectedBankAccountRecord> {
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.identityApplication.updateMany({
        where: {
          id: input.applicationId,
          userId: input.userId,
          version: input.expectedVersion,
          status: { in: ["draft", "rejected"] },
          deletedAt: null
        },
        data: { version: { increment: 1 } }
      });
      if (updated.count !== 1) {
        throw new AppError({
          code: ERROR_CODES.SAAS_BILLING_CONFLICT,
          message: "error.identity_application.version_conflict",
          statusCode: 409
        });
      }

      const account = await transaction.protectedBankAccount.create({
        data: {
          ownerUserId: input.userId,
          purpose: "merchant_application",
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

      await transaction.merchantApplicationDetail.update({
        where: { applicationId: input.applicationId },
        data: { bankAccountId: account.id }
      });
      if (input.previousBankAccountId !== null) {
        await transaction.protectedBankAccount.updateMany({
          where: {
            id: input.previousBankAccountId,
            ownerUserId: input.userId,
            deletedAt: null
          },
          data: { deletedAt: input.verifiedAt }
        });
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: "identity_application.bank_account.bound",
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
        verifiedAt: input.verifiedAt,
        applicationVersion: input.expectedVersion + 1
      };
    });
  }
}
