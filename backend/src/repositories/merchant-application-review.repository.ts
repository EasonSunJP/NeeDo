import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  ApproveMerchantApplicationRepositoryInput,
  MerchantApplicationApprovalResult,
  MerchantApplicationReviewListQuery,
  MerchantApplicationReviewPage,
  MerchantApplicationReviewRecord,
  MerchantApplicationReviewRepositoryPort,
  MerchantApplicationRejectionResult,
  RejectMerchantApplicationRepositoryInput
} from "../services/merchant-application-review.service";
import { BankAccountHolderService } from "../services/bank-account-holder.service";
import type { SensitiveFieldCipherService } from "../services/sensitive-field-cipher.service";
import { AppError } from "../utils/app-error";
import { buildIdentityActivationTransactionInput } from "../services/identity-activation.service";
import { IdentityActivationRepository } from "./identity-activation.repository";
import { resolveCanonicalPersonalIdentityId } from "./personal-identity-scope.repository";

const buildMerchantReviewSelect = (includeSensitiveDocuments: boolean, now: Date) =>
  ({
    id: true,
    userId: true,
    status: true,
    version: true,
    submittedSnapshotHash: true,
    submittedAt: true,
    createdAt: true,
    merchantDetail: {
      select: {
        applicantKind: true,
        corporateLegalName: true,
        corporateLegalNameKana: true,
        representativeName: true,
        representativeNameKana: true,
        shopName: true,
        businessAddress: true,
        contactPhone: true,
        responsiblePersonName: true,
        showcaseDraft: true,
        bankAccount: {
          select: {
            id: true,
            bankCode: true,
            bankName: true,
            branchCode: true,
            branchName: true,
            accountType: true,
            accountNumberEncrypted: true,
            accountHolderEncrypted: true,
            holderMatchHash: true,
            verificationSource: true,
            verificationStatus: true,
            verifiedAt: true,
            deletedAt: true
          }
        },
        contractAcceptance: {
          select: {
            id: true,
            contractType: true,
            contractVersion: true,
            contentHash: true,
            acceptedAt: true,
            language: true,
            receiptId: true,
            deletedAt: true
          }
        }
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
          orderBy: [{ verifiedAt: "desc" as const }, { id: "desc" as const }],
          take: 1,
          select: { nameMatchHash: true }
        }
      }
    },
    media: {
      where: includeSensitiveDocuments
        ? { deletedAt: null, mediaAsset: { deletedAt: null, purgedAt: null } }
        : { id: -1 },
      orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
      select: {
        purpose: true,
        mediaAsset: { select: { id: true, url: true, mimeType: true } }
      }
    },
    serviceCategories: {
      where: { deletedAt: null },
      orderBy: [{ category: { sortOrder: "asc" as const } }, { id: "asc" as const }],
      select: {
        category: {
          select: {
            id: true,
            code: true,
            qualificationPolicy: true,
            translations: {
              where: { locale: "JA" as const, deletedAt: null },
              select: { name: true },
              take: 1
            }
          }
        }
      }
    },
    businessKeywords: {
      where: { deletedAt: null },
      orderBy: [{ businessKeyword: { sortOrder: "asc" as const } }, { id: "asc" as const }],
      select: {
        businessKeyword: {
          select: {
            id: true,
            code: true,
            categoryId: true,
            qualificationPolicy: true,
            translations: {
              where: { locale: "JA" as const, deletedAt: null },
              select: { label: true },
              take: 1
            }
          }
        }
      }
    }
  }) satisfies Prisma.IdentityApplicationSelect;

type MerchantReviewRow = Prisma.IdentityApplicationGetPayload<{
  select: ReturnType<typeof buildMerchantReviewSelect>;
}>;

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stringFromRecord = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const maskHolder = (holderName: string): string => {
  const characters = Array.from(holderName.trim());
  if (characters.length <= 2) {
    return "•".repeat(Math.max(characters.length, 1));
  }
  return `${characters[0]}${"•".repeat(characters.length - 2)}${characters.at(-1)}`;
};

export class MerchantApplicationReviewRepository
  implements MerchantApplicationReviewRepositoryPort
{
  private readonly identityActivation: IdentityActivationRepository;
  private readonly holder = new BankAccountHolderService();

  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: SensitiveFieldCipherService,
    private readonly now: () => Date = () => new Date()
  ) {
    this.identityActivation = new IdentityActivationRepository(client);
  }

  public async list(
    query: MerchantApplicationReviewListQuery,
    includeSensitiveDocuments: boolean
  ): Promise<MerchantApplicationReviewPage> {
    const where: Prisma.IdentityApplicationWhereInput = {
      type: "merchant",
      deletedAt: null,
      merchantDetail: { deletedAt: null },
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await this.client.$transaction([
      this.client.identityApplication.findMany({
        where,
        select: buildMerchantReviewSelect(includeSensitiveDocuments, this.now()),
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.client.identityApplication.count({ where })
    ]);

    return {
      list: rows.flatMap((row) => {
        const mapped = this.map(row);
        return mapped ? [mapped] : [];
      }),
      total,
      page: query.page,
      page_size: query.pageSize
    };
  }

  public async findById(
    applicationId: number,
    includeSensitiveDocuments: boolean
  ): Promise<MerchantApplicationReviewRecord | null> {
    const row = await this.client.identityApplication.findFirst({
      where: { id: applicationId, type: "merchant", deletedAt: null },
      select: buildMerchantReviewSelect(includeSensitiveDocuments, this.now())
    });
    return row ? this.map(row) : null;
  }

  public approveInTransaction(
    input: ApproveMerchantApplicationRepositoryInput
  ): Promise<MerchantApplicationApprovalResult> {
    return this.client.$transaction(async (transaction) => {
      await this.closeForReview(transaction, input, "approved", null);
      await this.assertProtectedEvidence(transaction, input);

      const merchant = await transaction.merchantAccount.create({
        data: {
          code: `NEEDO-APP-${input.applicationId}`,
          ownerUserId: input.applicantUserId,
          settlementBankAccountId: input.bankAccountId,
          name: input.merchantAccountName,
          status: "active",
          paymentResponsibility: "group_consolidated"
        }
      });
      const shop = await transaction.shop.create({
        data: {
          ownerUserId: input.applicantUserId,
          name: input.shopName,
          description: stringFromRecord(input.showcaseDraft, "description"),
          city:
            stringFromRecord(input.showcaseDraft, "city") ??
            stringFromRecord(input.showcaseDraft, "area") ??
            input.businessAddress,
          address: input.businessAddress,
          phone: input.contactPhone,
          status: "published",
          isRecommended: false
        }
      });
      const taxonomy = await this.requireApplicationTaxonomy(transaction, input);
      await transaction.shopServiceCategory.createMany({
        data: taxonomy.categories.map((category) => ({
          shopId: shop.id,
          categoryId: category.id,
          selectedByUserId: input.applicantUserId
        }))
      });
      if (taxonomy.keywords.length > 0) {
        await transaction.shopBusinessKeyword.createMany({
          data: taxonomy.keywords.map((keyword) => ({
            shopId: shop.id,
            businessKeywordId: keyword.id,
            selectedByUserId: input.applicantUserId
          }))
        });
      }
      await transaction.shopServiceTaxonomyState.create({
        data: { shopId: shop.id, version: 1 }
      });
      const qualifications = [
        ...taxonomy.categories
          .filter((category) => category.qualificationPolicy !== "OPEN")
          .map((category) => ({ categoryId: category.id, businessKeywordId: null })),
        ...taxonomy.keywords
          .filter((keyword) => keyword.qualificationPolicy !== "OPEN")
          .map((keyword) => ({ categoryId: null, businessKeywordId: keyword.id }))
      ];
      if (qualifications.length > 0) {
        await transaction.shopServiceQualification.createMany({
          data: qualifications.map((qualification) => ({
            shopId: shop.id,
            ...qualification,
            sourceApplicationId: input.applicationId,
            status: "APPROVED" as const,
            expiresAt: null,
            approvedByUserId: input.reviewerUserId,
            reason: "Approved with merchant identity application"
          }))
        });
      }
      await transaction.merchantShopMembership.create({
        data: {
          merchantAccountId: merchant.id,
          shopId: shop.id,
          activeKey: `merchant:${merchant.id}:shop:${shop.id}`,
          startsAt: input.reviewedAt,
          createdById: input.reviewerUserId
        }
      });
      const billingProfile = await transaction.saasBillingProfile.create({
        data: {
          subjectType: "merchant_account",
          subjectId: merchant.id,
          merchantAccountId: merchant.id,
          activeKey: `merchant:${merchant.id}`,
          billingCadence: "monthly",
          monthlyFeeJpy: 9800,
          trialStatus: "active",
          trialStartedAt: input.trialStartsAt,
          trialEndsAt: input.trialEndsAt,
          trialUsedAt: input.trialStartsAt,
          paymentProvider: "manual"
        }
      });
      for (const period of input.freePeriods) {
        await transaction.saasFreePeriod.create({
          data: {
            billingProfileId: billingProfile.id,
            periodType: period.periodType,
            startsAt: period.startsAt,
            endsAt: period.endsAt,
            reason:
              period.periodType === "late_month_bonus"
                ? "Automatic late-month trial allowance"
                : "First three natural-month free trial",
            idempotencyKey: `merchant-application:${input.applicationId}:${period.periodType}`,
            createdById: input.reviewerUserId
          }
        });
      }

      const identity = await this.identityActivation.activateWithTransaction(
        transaction,
        buildIdentityActivationTransactionInput({
          kind: "merchant",
          userId: input.applicantUserId,
          actorUserId: input.reviewerUserId,
          displayName: input.displayName,
          scopeId: shop.id,
          applicationId: input.applicationId,
          contractAcceptanceId: input.contractAcceptanceId,
          activatedAt: input.reviewedAt
        })
      );
      await transaction.auditLog.create({
        data: {
          actorId: input.reviewerUserId,
          action: "identity_application.merchant.approved",
          targetType: "IdentityApplication",
          targetId: input.applicationId,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: input.applicationId,
            merchantAccountId: merchant.id,
            shopId: shop.id,
            identityId: identity.identityId,
            billingProfileId: billingProfile.id,
            bankAccountId: input.bankAccountId,
            contractAcceptanceId: input.contractAcceptanceId,
            serviceCategoryIds: input.serviceCategoryIds,
            businessKeywordIds: input.businessKeywordIds,
            qualificationCount: qualifications.length,
            trialEndsAt: input.trialEndsAt.toISOString(),
            automaticBonusDays: input.automaticBonusDays,
            version: input.expectedVersion + 1
          },
          createdAt: input.reviewedAt
        }
      });

      return {
        applicationId: input.applicationId,
        status: "approved",
        version: input.expectedVersion + 1,
        merchantAccountId: merchant.id,
        shopId: shop.id,
        identityId: identity.identityId,
        billingProfileId: billingProfile.id,
        reviewedAt: input.reviewedAt
      };
    });
  }

  public rejectInTransaction(
    input: RejectMerchantApplicationRepositoryInput
  ): Promise<MerchantApplicationRejectionResult> {
    return this.client.$transaction(async (transaction) => {
      await this.closeForReview(transaction, input, "rejected", input.rejectionReason);
      const recipientIdentityId = await resolveCanonicalPersonalIdentityId(
        transaction,
        input.applicantUserId
      );
      const actorIdentityId = await resolveCanonicalPersonalIdentityId(
        transaction,
        input.reviewerUserId
      );
      if (!recipientIdentityId || !actorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      await transaction.notification.create({
        data: {
          recipientUserId: input.applicantUserId,
          recipientIdentityId,
          actorUserId: input.reviewerUserId,
          actorIdentityId,
          type: "SYSTEM",
          title: "identity.application.rejected.title",
          body: "identity.application.rejected.body",
          payload: {
            applicationId: input.applicationId,
            rejectionReason: input.rejectionReason
          },
          createdAt: input.reviewedAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.reviewerUserId,
          action: "identity_application.merchant.rejected",
          targetType: "IdentityApplication",
          targetId: input.applicationId,
          ip: null,
          userAgent: null,
          metadata: {
            applicationId: input.applicationId,
            version: input.expectedVersion + 1,
            result: "rejected"
          },
          createdAt: input.reviewedAt
        }
      });
      return {
        applicationId: input.applicationId,
        status: "rejected",
        version: input.expectedVersion + 1,
        rejectionReason: input.rejectionReason,
        reviewedAt: input.reviewedAt
      };
    });
  }

  private async assertProtectedEvidence(
    transaction: Prisma.TransactionClient,
    input: ApproveMerchantApplicationRepositoryInput
  ): Promise<void> {
    const [bank, contract] = await Promise.all([
      transaction.protectedBankAccount.findFirst({
        where: {
          id: input.bankAccountId,
          ownerUserId: input.applicantUserId,
          purpose: "merchant_application",
          verificationStatus: "verified",
          deletedAt: null
        },
        select: { id: true }
      }),
      transaction.contractAcceptance.findFirst({
        where: {
          id: input.contractAcceptanceId,
          acceptedByUserId: input.applicantUserId,
          identityApplicationId: input.applicationId,
          contractType: "merchant",
          deletedAt: null
        },
        select: { id: true }
      })
    ]);
    if (!bank || !contract) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.approval_evidence_changed",
        statusCode: 409
      });
    }
  }

  private async closeForReview(
    transaction: Prisma.TransactionClient,
    input: ApproveMerchantApplicationRepositoryInput | RejectMerchantApplicationRepositoryInput,
    status: "approved" | "rejected",
    rejectionReason: string | null
  ): Promise<void> {
    const updated = await transaction.identityApplication.updateMany({
      where: {
        id: input.applicationId,
        userId: input.applicantUserId,
        version: input.expectedVersion,
        status: { in: ["submitted", "under_review"] },
        deletedAt: null,
        ...(status === "approved"
          ? {
              merchantDetail: {
                bankAccountId: (input as ApproveMerchantApplicationRepositoryInput).bankAccountId,
                contractAcceptanceId: (input as ApproveMerchantApplicationRepositoryInput)
                  .contractAcceptanceId
              }
            }
          : {})
      },
      data: {
        status,
        activeKey: null,
        version: { increment: 1 },
        reviewedAt: input.reviewedAt,
        reviewerUserId: input.reviewerUserId,
        rejectionReason,
        closedAt: input.reviewedAt,
        purgeAt: input.purgeAt
      }
    });
    if (updated.count !== 1) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.version_conflict",
        statusCode: 409
      });
    }
  }

  private map(row: MerchantReviewRow): MerchantApplicationReviewRecord | null {
    const detail = row.merchantDetail;
    if (!detail) {
      return null;
    }
    const bank = detail.bankAccount?.deletedAt === null ? detail.bankAccount : null;
    const contract =
      detail.contractAcceptance?.deletedAt === null ? detail.contractAcceptance : null;
    const applicantKind = detail.applicantKind as "corporate" | "individual";
    const expectedHolderHash =
      applicantKind === "corporate" && detail.corporateLegalNameKana
        ? this.cipher.matchHash(
            this.holder.normalizeForMatch("corporate", detail.corporateLegalNameKana)
          )
        : (row.applicant.ekycVerifications[0]?.nameMatchHash ?? null);

    return {
      applicationId: row.id,
      applicantUserId: row.userId,
      status: row.status,
      version: row.version,
      submittedSnapshotHash: row.submittedSnapshotHash,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      applicantKind,
      corporateLegalName: detail.corporateLegalName,
      corporateLegalNameKana: detail.corporateLegalNameKana,
      representativeName: detail.representativeName,
      representativeNameKana: detail.representativeNameKana,
      shopName: detail.shopName,
      businessAddress: detail.businessAddress,
      contactPhone: detail.contactPhone,
      responsiblePersonName: detail.responsiblePersonName,
      showcaseDraft: asRecord(detail.showcaseDraft),
      serviceCategories: (row.serviceCategories ?? []).flatMap(({ category }) =>
        category.translations[0]
          ? [{
              id: category.id,
              code: category.code,
              label: category.translations[0].name,
              qualificationPolicy: category.qualificationPolicy
            }]
          : []
      ),
      businessKeywords: (row.businessKeywords ?? []).flatMap(({ businessKeyword }) =>
        businessKeyword.translations[0]
          ? [{
              id: businessKeyword.id,
              code: businessKeyword.code,
              categoryId: businessKeyword.categoryId,
              label: businessKeyword.translations[0].label,
              qualificationPolicy: businessKeyword.qualificationPolicy
            }]
          : []
      ),
      bankAccount: bank
        ? {
            id: bank.id,
            bankCode: bank.bankCode,
            bankName: bank.bankName,
            branchCode: bank.branchCode,
            branchName: bank.branchName,
            accountType: bank.accountType,
            accountNumberMasked: this.cipher.maskAccountNumber(
              this.cipher.open(bank.accountNumberEncrypted)
            ),
            accountHolderMasked: maskHolder(this.cipher.open(bank.accountHolderEncrypted)),
            verificationSource: bank.verificationSource,
            verificationStatus: bank.verificationStatus,
            holderMatched:
              expectedHolderHash !== null && expectedHolderHash === bank.holderMatchHash,
            verifiedAt: bank.verifiedAt
          }
        : null,
      eKycVerified: row.applicant.ekycVerifications.length > 0,
      contractAcceptance: contract
        ? {
            id: contract.id,
            contractType: contract.contractType,
            contractVersion: contract.contractVersion,
            contentHash: contract.contentHash,
            acceptedAt: contract.acceptedAt,
            language: contract.language,
            receiptId: contract.receiptId
          }
        : null,
      media: row.media.map((item) => ({
        id: item.mediaAsset.id,
        purpose: item.purpose,
        url: `/api/v1/identity-applications/${row.id}/media/${item.mediaAsset.id}`,
        mimeType: item.mediaAsset.mimeType
      }))
    };
  }

  private async requireApplicationTaxonomy(
    transaction: Prisma.TransactionClient,
    input: ApproveMerchantApplicationRepositoryInput
  ) {
    const [categorySelections, keywordSelections] = await Promise.all([
      transaction.merchantApplicationServiceCategory.findMany({
        where: {
          applicationId: input.applicationId,
          deletedAt: null,
          category: { isActive: true, deletedAt: null }
        },
        select: { category: { select: { id: true, qualificationPolicy: true } } }
      }),
      transaction.merchantApplicationBusinessKeyword.findMany({
        where: {
          applicationId: input.applicationId,
          deletedAt: null,
          businessKeyword: {
            isActive: true,
            deletedAt: null,
            category: { isActive: true, deletedAt: null }
          }
        },
        select: {
          businessKeyword: {
            select: { id: true, categoryId: true, qualificationPolicy: true }
          }
        }
      })
    ]);
    const categories = categorySelections.map((selection) => selection.category);
    const keywords = keywordSelections.map((selection) => selection.businessKeyword);
    const categoryIds = new Set(categories.map((category) => category.id));
    const expectedCategoryIds = [...input.serviceCategoryIds].sort((a, b) => a - b);
    const expectedKeywordIds = [...input.businessKeywordIds].sort((a, b) => a - b);
    const actualCategoryIds = categories.map((category) => category.id).sort((a, b) => a - b);
    const actualKeywordIds = keywords.map((keyword) => keyword.id).sort((a, b) => a - b);
    if (
      JSON.stringify(actualCategoryIds) !== JSON.stringify(expectedCategoryIds) ||
      JSON.stringify(actualKeywordIds) !== JSON.stringify(expectedKeywordIds) ||
      keywords.some((keyword) => !categoryIds.has(keyword.categoryId))
    ) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.taxonomy_selection_changed",
        statusCode: 409
      });
    }
    return { categories, keywords };
  }
}

export const createMerchantApplicationReviewRepository = (
  cipher: SensitiveFieldCipherService
): MerchantApplicationReviewRepository => new MerchantApplicationReviewRepository(prisma, cipher);
