import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  AcceptAndBindMerchantContractRepositoryInput,
  MerchantContractAcceptanceProjection,
  MerchantContractAcceptanceRepositoryPort
} from "../services/merchant-contract-acceptance.service";
import { AppError } from "../utils/app-error";

export class MerchantContractAcceptanceRepository
  implements MerchantContractAcceptanceRepositoryPort
{
  public constructor(private readonly client: PrismaClient = prisma) {}

  public acceptAndBindInTransaction(
    input: AcceptAndBindMerchantContractRepositoryInput
  ): Promise<MerchantContractAcceptanceProjection> {
    return this.client.$transaction(async (transaction) => {
      const acceptanceKey = [
        input.userId,
        "merchant",
        input.contract.version,
        "application",
        input.applicationId
      ].join(":");
      const existing = await transaction.contractAcceptance.findUnique({
        where: { acceptanceKey },
        select: {
          id: true,
          contractVersion: true,
          contentHash: true,
          acceptedAt: true,
          receiptId: true
        }
      });
      if (existing) {
        const application = await transaction.identityApplication.findFirst({
          where: {
            id: input.applicationId,
            userId: input.userId,
            type: "merchant",
            deletedAt: null,
            merchantDetail: { contractAcceptanceId: existing.id, deletedAt: null }
          },
          select: { version: true }
        });
        if (application) {
          return this.map(existing, input.applicationId, application.version);
        }
      }

      const updated = await transaction.identityApplication.updateMany({
        where: {
          id: input.applicationId,
          userId: input.userId,
          type: "merchant",
          version: input.expectedVersion,
          status: { in: ["draft", "rejected"] },
          deletedAt: null,
          merchantDetail: { deletedAt: null }
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

      const acceptance = await transaction.contractAcceptance.create({
        data: {
          acceptedByUserId: input.userId,
          identityApplicationId: input.applicationId,
          contractType: "merchant",
          contractVersion: input.contract.version,
          effectiveAt: input.contract.effectiveAt,
          acceptedTextSnapshot: input.contract.text,
          contentHash: input.contract.contentHash,
          acceptedAt: input.acceptedAt,
          language: input.contract.language,
          sessionId: input.sessionId,
          receiptId: input.receiptId,
          acceptanceKey
        }
      });
      await transaction.merchantApplicationDetail.update({
        where: { applicationId: input.applicationId },
        data: { contractAcceptanceId: acceptance.id }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: "identity_application.merchant.contract.accepted",
          targetType: "IdentityApplication",
          targetId: input.applicationId,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: input.applicationId,
            contractAcceptanceId: acceptance.id,
            contractVersion: input.contract.version,
            contentHash: input.contract.contentHash,
            receiptId: input.receiptId,
            version: input.expectedVersion + 1
          },
          createdAt: input.acceptedAt
        }
      });
      return this.map(acceptance, input.applicationId, input.expectedVersion + 1);
    });
  }

  private map(
    acceptance: {
      id: number;
      contractVersion: string;
      contentHash: string;
      acceptedAt: Date;
      receiptId: string;
    },
    applicationId: number,
    applicationVersion: number
  ): MerchantContractAcceptanceProjection {
    return {
      id: acceptance.id,
      applicationId,
      applicationVersion,
      contractType: "merchant",
      contractVersion: acceptance.contractVersion,
      contentHash: acceptance.contentHash,
      acceptedAt: acceptance.acceptedAt,
      receiptId: acceptance.receiptId
    };
  }
}
