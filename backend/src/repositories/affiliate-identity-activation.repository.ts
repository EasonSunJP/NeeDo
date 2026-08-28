import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  ActivateAffiliateWithContractRepositoryInput,
  AffiliateContractAcceptanceProjection,
  AffiliateIdentityActivationRepositoryPort,
  AffiliateIdentityActivationResult
} from "../services/affiliate-identity-activation.service";
import { buildIdentityActivationTransactionInput } from "../services/identity-activation.service";
import { AppError } from "../utils/app-error";
import { IdentityActivationRepository } from "./identity-activation.repository";

export class AffiliateIdentityActivationRepository implements AffiliateIdentityActivationRepositoryPort {
  private readonly identityActivation: IdentityActivationRepository;

  public constructor(private readonly client: PrismaClient = prisma) {
    this.identityActivation = new IdentityActivationRepository(client);
  }

  public activateWithContractInTransaction(
    input: ActivateAffiliateWithContractRepositoryInput
  ): Promise<AffiliateIdentityActivationResult> {
    return this.client.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: input.userId, isActive: true, deletedAt: null },
        select: { id: true, needoId: true, username: true }
      });
      if (!user) {
        throw new AppError({
          code: ERROR_CODES.USER_NOT_FOUND,
          message: "error.user_not_found",
          statusCode: 404
        });
      }

      const acceptanceKey = `${input.userId}:affiliate:${input.contract.version}`;
      const existingAcceptance = await transaction.contractAcceptance.findUnique({
        where: { acceptanceKey },
        select: {
          id: true,
          acceptedByUserId: true,
          contractType: true,
          contractVersion: true,
          contentHash: true,
          acceptedAt: true,
          receiptId: true
        }
      });
      const acceptance =
        existingAcceptance ??
        (await transaction.contractAcceptance.create({
          data: {
            acceptedByUserId: input.userId,
            identityApplicationId: null,
            contractType: "affiliate",
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
        }));

      if (!existingAcceptance) {
        await transaction.auditLog.create({
          data: {
            actorId: input.userId,
            action: "contract.acceptance.created",
            targetType: "ContractAcceptance",
            targetId: acceptance.id,
            ip: null,
            userAgent: null,
            metadata: {
              contractType: "affiliate",
              contractVersion: input.contract.version,
              contentHash: input.contract.contentHash,
              receiptId: input.receiptId
            },
            createdAt: input.acceptedAt
          }
        });
      }

      const existingIdentity = await transaction.userIdentity.findFirst({
        where: { userId: input.userId, type: "scout", isActive: true, deletedAt: null },
        select: { id: true, userId: true, type: true, scopeType: true, scopeId: true }
      });
      if (!existingIdentity) {
        await this.identityActivation.activateWithTransaction(
          transaction,
          buildIdentityActivationTransactionInput({
            kind: "affiliate",
            userId: input.userId,
            actorUserId: input.userId,
            displayName: user.username,
            scopeId: null,
            applicationId: null,
            contractAcceptanceId: acceptance.id,
            activatedAt: input.acceptedAt
          })
        );
      }

      const profile = await transaction.affiliateProfile.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId },
        update: {},
        select: { id: true, status: true }
      });
      return {
        contractAcceptance: this.mapAcceptance(acceptance),
        affiliate: {
          affiliateStatus: profile.status.toLowerCase() as "active" | "suspended" | "closed",
          needoId: user.needoId,
          profileId: profile.id
        }
      };
    });
  }

  private mapAcceptance(acceptance: {
    id: number;
    contractType: string;
    contractVersion: string;
    contentHash: string;
    acceptedAt: Date;
    receiptId: string;
  }): AffiliateContractAcceptanceProjection {
    return {
      id: acceptance.id,
      contractType: "affiliate",
      contractVersion: acceptance.contractVersion,
      contentHash: acceptance.contentHash,
      acceptedAt: acceptance.acceptedAt,
      receiptId: acceptance.receiptId
    };
  }
}
