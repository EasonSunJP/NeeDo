import type { SensitiveFieldCipherService } from "../services/sensitive-field-cipher.service";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  type CloseIdentityApplicationRepositoryInput,
  type CreateMerchantDraftRepositoryInput,
  type CreateTechnicianDraftRepositoryInput,
  type IdentityApplicationRecord,
  type IdentityApplicationListQuery,
  type IdentityApplicationRepositoryPort,
  type MerchantApplicationDetailRecord,
  type EligibleShopSearchQuery,
  type EligibleShopSearchResult,
  type PaginatedResult,
  type SubmitIdentityApplicationRepositoryInput,
  type TechnicianApplicationDetailRecord,
  type UpdateMerchantDraftRepositoryInput,
  type UpdateTechnicianDraftRepositoryInput
} from "../services/identity-application.service";
import type {
  IdentityApplicationStatus,
  IdentityApplicationType
} from "../services/identity-application-policy.service";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const identityApplicationInclude = {
  technicianDetail: { include: { targetShop: { select: { name: true, publicIdentifier: { select: { publicId: true } } } } } },
  merchantDetail: {
    include: {
      contractAcceptance: { select: { contractVersion: true, acceptedTextSnapshot: true, acceptedAt: true, receiptId: true, deletedAt: true } },
      bankAccount: {
        select: { bankCode: true, bankName: true, branchCode: true, branchName: true, accountType: true, accountNumberEncrypted: true, accountHolderEncrypted: true, verificationStatus: true, deletedAt: true }
      }
    }
  },
  media: {
    where: { deletedAt: null, variant: "original" },
    select: {
      purpose: true,
      mediaAssetId: true,
      previews: {
        where: { deletedAt: null, variant: "preview" },
        take: 1,
        select: { mediaAssetId: true }
      }
    }
  },
  applicant: {
    select: {
      ekycVerifications: {
        where: { status: "verified", deletedAt: null },
        select: { expiresAt: true }
      }
    }
  },
  serviceCategories: {
    where: { deletedAt: null },
    select: { categoryId: true, category: { select: { translations: { where: { locale: "JA", deletedAt: null }, take: 1, select: { name: true } } } } },
    orderBy: [{ categoryId: "asc" as const }, { id: "asc" as const }]
  },
  businessKeywords: {
    where: { deletedAt: null },
    select: { businessKeywordId: true, businessKeyword: { select: { translations: { where: { locale: "JA", deletedAt: null }, take: 1, select: { label: true } } } } },
    orderBy: [{ businessKeywordId: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.IdentityApplicationInclude;

type IdentityApplicationRow = Prisma.IdentityApplicationGetPayload<{
  include: typeof identityApplicationInclude;
}>;
type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const asStringArray = (value: Prisma.JsonValue | null): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const asObject = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

export class IdentityApplicationRepository implements IdentityApplicationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma, private readonly cipher?: SensitiveFieldCipherService) {}

  public async listMine(
    userId: number,
    query: IdentityApplicationListQuery
  ): Promise<PaginatedResult<IdentityApplicationRecord>> {
    const where: Prisma.IdentityApplicationWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      deletedAt: null
    };
    const [rows, total] = await this.client.$transaction([
      this.client.identityApplication.findMany({
        where,
        include: identityApplicationInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.client.identityApplication.count({ where })
    ]);

    return {
      list: rows.map((row) => this.mapApplication(row)),
      total,
      page: query.page,
      page_size: query.pageSize
    };
  }

  public async searchEligibleShops(
    query: EligibleShopSearchQuery
  ): Promise<PaginatedResult<EligibleShopSearchResult>> {
    const where: Prisma.ShopWhereInput = {
      status: "published",
      deletedAt: null,
      OR: [
        { publicIdentifier: { is: { publicId: query.query.toLowerCase(), deletedAt: null } } },
        { name: { contains: query.query } },
        { city: { contains: query.query } },
        { address: { contains: query.query } }
      ]
    };
    const [rows, total] = await this.client.$transaction([
      this.client.shop.findMany({
        where,
        select: {
          id: true, name: true, city: true, address: true, publicIdentifier: { select: { publicId: true } },
          mediaAssets: { where: { deletedAt: null, isActive: true, usageType: "cover" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { url: true } },
          reviewSummary: { select: { ratingAverage: true, reviewCount: true, deletedAt: true } },
          businessKeywordSelections: { where: { deletedAt: null, businessKeyword: { isActive: true, deletedAt: null, category: { isActive: true, deletedAt: null } } }, take: 10, orderBy: { id: "asc" }, select: { businessKeyword: { select: { translations: { where: { locale: "JA", deletedAt: null }, take: 1, select: { label: true } } } } } }
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.client.shop.count({ where })
    ]);

    return {
      list: rows.map((row) => ({
        id: row.id,
        merchantId: row.publicIdentifier?.publicId ?? "",
        name: row.name,
        city: row.city,
        address: row.address,
        coverUrl: row.mediaAssets?.[0]?.url ?? null,
        rating: row.reviewSummary?.deletedAt === null ? Number(row.reviewSummary.ratingAverage) : null,
        reviewCount: row.reviewSummary?.deletedAt === null ? row.reviewSummary.reviewCount : 0,
        keywords: (row.businessKeywordSelections ?? []).flatMap(item => item.businessKeyword.translations.map(value => value.label))
      })),
      total,
      page: query.page,
      page_size: query.pageSize
    };
  }

  public async findActiveByUserAndType(
    userId: number,
    type: IdentityApplicationType
  ): Promise<IdentityApplicationRecord | null> {
    const row = await this.client.identityApplication.findFirst({
      where: {
        userId,
        type,
        activeKey: { not: null },
        deletedAt: null
      },
      include: identityApplicationInclude
    });

    return row ? this.mapApplication(row) : null;
  }

  public async hasActiveIdentity(userId: number, type: IdentityApplicationType): Promise<boolean> {
    const identityTypes =
      type === "merchant" ? ["merchant", "merchant_owner", "merchant_staff"] : [type];
    const identity = await this.client.userIdentity.findFirst({
      where: {
        userId,
        type: { in: identityTypes },
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });

    return identity !== null;
  }

  public async hasTechnicianShopAffiliation(userId: number, shopId: number): Promise<boolean> {
    const affiliation = await this.client.technicianShopAffiliation.findFirst({
      where: {
        technicianProfile: { userId, deletedAt: null },
        shopId,
        workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
        deletedAt: null
      },
      select: { id: true }
    });
    return affiliation !== null;
  }

  public async isShopEligibleForTechnicianApplications(shopId: number): Promise<boolean> {
    const shop = await this.client.shop.findFirst({
      where: { id: shopId, status: "published", deletedAt: null },
      select: { id: true }
    });

    return shop !== null;
  }

  public async assertMerchantTaxonomySelection(input: {
    serviceCategoryIds: number[];
    businessKeywordIds: number[];
  }): Promise<void> {
    await this.assertTaxonomySelection(this.client, input);
  }

  public async createTechnicianDraft(
    input: CreateTechnicianDraftRepositoryInput
  ): Promise<IdentityApplicationRecord> {
    const row = await this.client.identityApplication.create({
      data: {
        userId: input.userId,
        type: "technician",
        status: "draft",
        activeKey: input.activeKey,
        technicianDetail: {
          create: this.toTechnicianData(input.detail)
        }
      },
      include: identityApplicationInclude
    });

    return this.mapApplication(row);
  }

  public async createMerchantDraft(
    input: CreateMerchantDraftRepositoryInput
  ): Promise<IdentityApplicationRecord> {
    const row = await this.client.identityApplication.create({
      data: {
        userId: input.userId,
        type: "merchant",
        status: "draft",
        activeKey: input.activeKey,
        merchantDetail: {
          create: this.toMerchantData(input.detail)
        },
        serviceCategories: {
          create: input.detail.serviceCategoryIds.map((categoryId) => ({
            categoryId,
            selectedByUserId: input.userId
          }))
        },
        businessKeywords: {
          create: input.detail.businessKeywordIds.map((businessKeywordId) => ({
            businessKeywordId,
            selectedByUserId: input.userId
          }))
        }
      },
      include: identityApplicationInclude
    });

    return this.mapApplication(row);
  }

  public async findById(applicationId: number): Promise<IdentityApplicationRecord | null> {
    const row = await this.findRowById(this.client, applicationId);
    return row ? this.mapApplication(row) : null;
  }

  public updateTechnicianDraft(
    input: UpdateTechnicianDraftRepositoryInput
  ): Promise<IdentityApplicationRecord> {
    return this.client.$transaction(async (transaction) => {
      await this.updateDraftApplication(transaction, input);
      await transaction.technicianApplicationDetail.update({
        where: { applicationId: input.applicationId },
        data: {
          ...this.toTechnicianData(input.detail),
          submittedSnapshot: Prisma.JsonNull
        }
      });
      return this.requireMapped(transaction, input.applicationId);
    });
  }

  public updateMerchantDraft(
    input: UpdateMerchantDraftRepositoryInput
  ): Promise<IdentityApplicationRecord> {
    return this.client.$transaction(async (transaction) => {
      await this.updateDraftApplication(transaction, input);
      await this.assertTaxonomySelection(transaction, input.detail);
      await transaction.merchantApplicationDetail.update({
        where: { applicationId: input.applicationId },
        data: {
          ...this.toMerchantData(input.detail),
          submittedSnapshot: Prisma.JsonNull
        }
      });
      const removedAt = new Date();
      await Promise.all([
        transaction.merchantApplicationServiceCategory.updateMany({
          where: { applicationId: input.applicationId, deletedAt: null },
          data: { deletedAt: removedAt }
        }),
        transaction.merchantApplicationBusinessKeyword.updateMany({
          where: { applicationId: input.applicationId, deletedAt: null },
          data: { deletedAt: removedAt }
        })
      ]);
      if (input.detail.serviceCategoryIds.length > 0) {
        await transaction.merchantApplicationServiceCategory.createMany({
          data: input.detail.serviceCategoryIds.map((categoryId) => ({
            applicationId: input.applicationId,
            categoryId,
            selectedByUserId: input.selectedByUserId
          }))
        });
      }
      if (input.detail.businessKeywordIds.length > 0) {
        await transaction.merchantApplicationBusinessKeyword.createMany({
          data: input.detail.businessKeywordIds.map((businessKeywordId) => ({
            applicationId: input.applicationId,
            businessKeywordId,
            selectedByUserId: input.selectedByUserId
          }))
        });
      }
      return this.requireMapped(transaction, input.applicationId);
    });
  }

  public submit(
    input: SubmitIdentityApplicationRepositoryInput
  ): Promise<IdentityApplicationRecord> {
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.identityApplication.updateMany({
        where: {
          id: input.applicationId,
          version: input.expectedVersion,
          status: "draft",
          deletedAt: null
        },
        data: {
          status: "submitted",
          version: { increment: 1 },
          submittedSnapshotHash: input.submittedSnapshotHash,
          submittedAt: input.submittedAt
        }
      });
      this.assertUpdated(updated.count);

      const row = await this.findRowById(transaction, input.applicationId);
      if (!row) {
        throw this.notFound();
      }
      const submittedSnapshot = input.submittedSnapshot as Prisma.InputJsonValue;
      if (row.type === "technician") {
        await transaction.technicianApplicationDetail.update({
          where: { applicationId: input.applicationId },
          data: { submittedSnapshot }
        });
      } else {
        await transaction.merchantApplicationDetail.update({
          where: { applicationId: input.applicationId },
          data: { submittedSnapshot }
        });
      }

      return this.requireMapped(transaction, input.applicationId);
    });
  }

  public close(input: CloseIdentityApplicationRepositoryInput): Promise<IdentityApplicationRecord> {
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.identityApplication.updateMany({
        where: {
          id: input.applicationId,
          version: input.expectedVersion,
          status: { in: ["draft", "submitted", "under_review"] },
          deletedAt: null
        },
        data: {
          status: input.status,
          activeKey: null,
          version: { increment: 1 },
          closedAt: input.closedAt,
          purgeAt: input.purgeAt
        }
      });
      this.assertUpdated(updated.count);
      return this.requireMapped(transaction, input.applicationId);
    });
  }

  private async updateDraftApplication(
    transaction: Prisma.TransactionClient,
    input: UpdateTechnicianDraftRepositoryInput | UpdateMerchantDraftRepositoryInput
  ): Promise<void> {
    const updated = await transaction.identityApplication.updateMany({
      where: {
        id: input.applicationId,
        version: input.expectedVersion,
        status: { in: ["draft", "rejected"] },
        purgeStartedAt: null,
        deletedAt: null
      },
      data: {
        status: input.nextStatus,
        activeKey: input.activeKey,
        version: { increment: 1 },
        submittedSnapshotHash: null,
        submittedAt: null,
        reviewedAt: null,
        reviewerUserId: null,
        rejectionReason: null,
        closedAt: null,
        purgeAt: null,
        purgeStartedAt: null,
        purgedAt: null
      }
    });
    this.assertUpdated(updated.count);
  }

  private findRowById(
    client: DatabaseClient,
    applicationId: number
  ): Promise<IdentityApplicationRow | null> {
    return client.identityApplication.findFirst({
      where: { id: applicationId, deletedAt: null },
      include: identityApplicationInclude
    });
  }

  private async requireMapped(
    client: DatabaseClient,
    applicationId: number
  ): Promise<IdentityApplicationRecord> {
    const row = await this.findRowById(client, applicationId);
    if (!row) {
      throw this.notFound();
    }
    return this.mapApplication(row);
  }

  private mapApplication(row: IdentityApplicationRow): IdentityApplicationRecord {
    const technicianDetail = row.technicianDetail
      ? this.mapTechnicianDetail(row.technicianDetail)
      : null;
    const ekycVerified = row.applicant.ekycVerifications.some(
      (verification) =>
        verification.expiresAt === null || verification.expiresAt.getTime() > Date.now()
    );
    const merchantDetail = row.merchantDetail
      ? this.mapMerchantDetail(
          row.merchantDetail,
          row.media.map((item) => item.purpose),
          ekycVerified,
          (row.serviceCategories ?? []).map((item) => item.categoryId),
          (row.businessKeywords ?? []).map((item) => item.businessKeywordId)
        )
      : null;

    return {
      id: row.id,
      userId: row.userId,
      type: row.type as IdentityApplicationType,
      status: row.status as IdentityApplicationStatus,
      version: row.version,
      activeKey: row.activeKey,
      submittedSnapshotHash: row.submittedSnapshotHash,
      submittedAt: row.submittedAt,
      closedAt: row.closedAt,
      purgeAt: row.purgeAt,
      purgedAt: row.purgedAt,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      technicianDetail,
      merchantDetail,
      reviewEvidence: {
        serviceCategories: (row.serviceCategories ?? []).flatMap(item => item.category?.translations.map(value => value.name) ?? []),
        businessKeywords: (row.businessKeywords ?? []).flatMap(item => item.businessKeyword?.translations.map(value => value.label) ?? []),
        targetShopName: row.technicianDetail?.targetShop?.name ?? null,
        targetShopPublicId: row.technicianDetail?.targetShop?.publicIdentifier?.publicId ?? null,
        media: row.media.map(item => ({
          id: item.previews[0]?.mediaAssetId ?? item.mediaAssetId,
          purpose: item.purpose
        })),
        bankAccount: this.mapBankEvidence(row.merchantDetail?.bankAccount),
        contractAcceptance: row.merchantDetail?.contractAcceptance?.deletedAt === null ? {
          contractVersion: row.merchantDetail.contractAcceptance.contractVersion,
          acceptedTextSnapshot: row.merchantDetail.contractAcceptance.acceptedTextSnapshot,
          acceptedAt: row.merchantDetail.contractAcceptance.acceptedAt,
          receiptId: row.merchantDetail.contractAcceptance.receiptId
        } : null
      }
    };
  }

  private mapBankEvidence(bank: NonNullable<IdentityApplicationRow["merchantDetail"]>["bankAccount"] | undefined) {
    if (!bank || bank.deletedAt !== null) return null;
    return {
      bankCode: bank.bankCode, bankName: bank.bankName, branchCode: bank.branchCode, branchName: bank.branchName, accountType: bank.accountType, verificationStatus: bank.verificationStatus,
      accountNumberMasked: this.cipher ? this.cipher.maskAccountNumber(this.cipher.open(bank.accountNumberEncrypted)) : null,
      accountHolderMasked: this.cipher ? `${Array.from(this.cipher.open(bank.accountHolderEncrypted)).slice(0, 2).join("")}***` : null
    };
  }

  private mapTechnicianDetail(
    detail: NonNullable<IdentityApplicationRow["technicianDetail"]>
  ): TechnicianApplicationDetailRecord {
    return {
      targetShopId: detail.targetShopId,
      applicantName: detail.applicantName,
      phone: detail.phone,
      city: detail.city,
      serviceAreas: asStringArray(detail.serviceAreas),
      skills: asStringArray(detail.skills),
      yearsExperience: detail.yearsExperience,
      bio: detail.bio,
      gender: detail.gender,
      birthDate: detail.birthDate
    };
  }

  private mapMerchantDetail(
    detail: NonNullable<IdentityApplicationRow["merchantDetail"]>,
    mediaPurposes: string[],
    eKycVerified: boolean,
    serviceCategoryIds: number[],
    businessKeywordIds: number[]
  ): MerchantApplicationDetailRecord {
    return {
      applicantKind: detail.applicantKind as "corporate" | "individual",
      corporateLegalName: detail.corporateLegalName,
      corporateLegalNameKana: detail.corporateLegalNameKana,
      representativeName: detail.representativeName,
      representativeNameKana: detail.representativeNameKana,
      shopName: detail.shopName,
      businessAddress: detail.businessAddress,
      contactPhone: detail.contactPhone,
      responsiblePersonName: detail.responsiblePersonName,
      showcaseDraft: asObject(detail.showcaseDraft),
      serviceCategoryIds,
      businessKeywordIds,
      bankAccountId: detail.bankAccountId,
      contractAcceptanceId: detail.contractAcceptanceId,
      mediaPurposes,
      bankVerificationStatus: detail.bankAccount?.verificationStatus ?? null,
      eKycVerified
    };
  }

  private toTechnicianData(
    detail: TechnicianApplicationDetailRecord
  ): Prisma.TechnicianApplicationDetailUncheckedCreateWithoutApplicationInput {
    return {
      targetShopId: detail.targetShopId,
      applicantName: detail.applicantName,
      phone: detail.phone,
      city: detail.city,
      serviceAreas: detail.serviceAreas,
      skills: detail.skills,
      yearsExperience: detail.yearsExperience,
      bio: detail.bio,
      gender: detail.gender,
      birthDate: detail.birthDate
    };
  }

  private toMerchantData(
    detail: MerchantApplicationDetailRecord
  ): Prisma.MerchantApplicationDetailUncheckedCreateWithoutApplicationInput {
    return {
      applicantKind: detail.applicantKind,
      corporateLegalName: detail.corporateLegalName,
      corporateLegalNameKana: detail.corporateLegalNameKana,
      representativeName: detail.representativeName,
      representativeNameKana: detail.representativeNameKana,
      shopName: detail.shopName,
      businessAddress: detail.businessAddress,
      contactPhone: detail.contactPhone,
      responsiblePersonName: detail.responsiblePersonName,
      showcaseDraft: detail.showcaseDraft as Prisma.InputJsonValue,
      bankAccountId: detail.bankAccountId,
      contractAcceptanceId: detail.contractAcceptanceId
    };
  }

  private async assertTaxonomySelection(
    client: DatabaseClient,
    input: { serviceCategoryIds: number[]; businessKeywordIds: number[] }
  ): Promise<void> {
    const [categories, keywords] = await Promise.all([
      client.category.findMany({
        where: { id: { in: input.serviceCategoryIds }, isActive: true, deletedAt: null },
        select: { id: true }
      }),
      client.businessKeyword.findMany({
        where: {
          id: { in: input.businessKeywordIds },
          isActive: true,
          deletedAt: null,
          category: { isActive: true, deletedAt: null }
        },
        select: { id: true, categoryId: true }
      })
    ]);
    const categoryIds = new Set(categories.map((category) => category.id));
    const keywordIds = new Set(keywords.map((keyword) => keyword.id));
    if (
      categories.length !== input.serviceCategoryIds.length ||
      keywords.length !== input.businessKeywordIds.length ||
      keywords.some((keyword) => !categoryIds.has(keyword.categoryId)) ||
      input.businessKeywordIds.some((id) => !keywordIds.has(id))
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identity_application.taxonomy_selection_invalid",
        statusCode: 400
      });
    }
  }

  private assertUpdated(count: number): void {
    if (count !== 1) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.version_conflict",
        statusCode: 409
      });
    }
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.identity_application.not_found",
      statusCode: 404
    });
  }
}
