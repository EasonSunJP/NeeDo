import { Prisma, type PrismaClient, type TaxonomyLocale } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import type { ShopTaxonomyQualificationPort } from "../services/shop-taxonomy.service";
import type { ShopTaxonomyCatalogQuery } from "../validators/shop-taxonomy.validator";

const LOCALE_TO_ENUM: Record<ShopTaxonomyCatalogQuery["locale"], TaxonomyLocale> = {
  "zh-CN": "ZH_CN",
  "zh-TW": "ZH_TW",
  ja: "JA",
  en: "EN",
  ko: "KO"
};

export type LocalizedServiceCategory = {
  id: number;
  code: string;
  label: string;
  qualificationPolicy: string;
};

export type LocalizedBusinessKeyword = {
  id: number;
  code: string;
  categoryId: number;
  label: string;
  qualificationPolicy: string;
};

export type ShopServiceTaxonomyPayload = {
  revision: number;
  categoryLimit: number;
  keywordLimit: number;
  selectedCategories: LocalizedServiceCategory[];
  selectedKeywords: LocalizedBusinessKeyword[];
  removedKeywordIds: number[];
};

export type ShopTaxonomySelectionState = Omit<
  ShopServiceTaxonomyPayload,
  "categoryLimit" | "keywordLimit" | "removedKeywordIds"
>;

export interface ShopTaxonomyRepositoryPort extends ShopTaxonomyQualificationPort {
  listCategories(
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedServiceCategory>>;
  listKeywords(
    categoryId: number,
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedBusinessKeyword>>;
  getShopSelectionState(
    shopId: number,
    locale: ShopTaxonomyCatalogQuery["locale"]
  ): Promise<ShopTaxonomySelectionState>;
  replaceShopSelection(input: {
    shopId: number;
    actorUserId: number;
    categoryIds: number[];
    keywordIds: number[];
    expectedRevision: number;
    idempotencyKey: string;
    requestFingerprint: string;
    locale: ShopTaxonomyCatalogQuery["locale"];
    categoryLimit: number;
    keywordLimit: number;
    at: Date;
  }): Promise<ShopServiceTaxonomyPayload>;
}

type ShopTaxonomyPrisma = Pick<
  PrismaClient,
  | "$transaction"
  | "category"
  | "businessKeyword"
  | "shopServiceQualification"
  | "shopServiceCategory"
  | "shopBusinessKeyword"
  | "shopServiceTaxonomyState"
  | "shopServiceTaxonomyCommand"
  | "auditLog"
>;

export class ShopTaxonomyRepository implements ShopTaxonomyRepositoryPort {
  public constructor(private readonly db: ShopTaxonomyPrisma = prisma) {}

  public async listCategories(
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedServiceCategory>> {
    const pagination = toPrismaPagination(input);
    const locale = LOCALE_TO_ENUM[input.locale];
    const where = {
      isActive: true,
      deletedAt: null,
      translations: { some: { locale, deletedAt: null } }
    } as const;
    const [rows, total] = await Promise.all([
      this.db.category.findMany({
        where,
        select: {
          id: true,
          code: true,
          qualificationPolicy: true,
          translations: {
            where: { locale, deletedAt: null },
            select: { name: true },
            take: 1
          }
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.db.category.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        label: row.translations[0]?.name ?? "",
        qualificationPolicy: row.qualificationPolicy
      })),
      total,
      input
    );
  }

  public async listKeywords(
    categoryId: number,
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedBusinessKeyword>> {
    const pagination = toPrismaPagination(input);
    const locale = LOCALE_TO_ENUM[input.locale];
    const where = {
      categoryId,
      isActive: true,
      deletedAt: null,
      category: { isActive: true, deletedAt: null },
      translations: { some: { locale, deletedAt: null } }
    } as const;
    const [rows, total] = await Promise.all([
      this.db.businessKeyword.findMany({
        where,
        select: {
          id: true,
          code: true,
          categoryId: true,
          qualificationPolicy: true,
          translations: {
            where: { locale, deletedAt: null },
            select: { label: true },
            take: 1
          }
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.db.businessKeyword.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        categoryId: row.categoryId,
        label: row.translations[0]?.label ?? "",
        qualificationPolicy: row.qualificationPolicy
      })),
      total,
      input
    );
  }

  public async assertSelectable(input: {
    shopId: number;
    categoryIds: number[];
    keywordIds: number[];
    at: Date;
  }): Promise<void> {
    const [categories, keywords, qualifications] = await Promise.all([
      this.db.category.findMany({
        where: { id: { in: input.categoryIds }, isActive: true, deletedAt: null },
        select: { id: true, qualificationPolicy: true }
      }),
      this.db.businessKeyword.findMany({
        where: {
          id: { in: input.keywordIds },
          isActive: true,
          deletedAt: null,
          category: { isActive: true, deletedAt: null }
        },
        select: { id: true, categoryId: true, qualificationPolicy: true }
      }),
      this.db.shopServiceQualification.findMany({
        where: {
          shopId: input.shopId,
          status: "APPROVED",
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: input.at } }],
          AND: [
            {
              OR: [
                { categoryId: { in: input.categoryIds } },
                { businessKeywordId: { in: input.keywordIds } }
              ]
            }
          ]
        },
        select: { categoryId: true, businessKeywordId: true }
      })
    ]);

    if (
      categories.length !== input.categoryIds.length ||
      keywords.length !== input.keywordIds.length
    ) {
      throw this.conflict("error.shop_taxonomy.selection_unavailable");
    }

    const selectedCategoryIds = new Set(input.categoryIds);
    if (keywords.some((keyword) => !selectedCategoryIds.has(keyword.categoryId))) {
      throw this.conflict("error.shop_taxonomy.keyword_category_mismatch");
    }

    const approvedCategoryIds = new Set(
      qualifications.flatMap((qualification) =>
        qualification.categoryId === null ? [] : [qualification.categoryId]
      )
    );
    const approvedKeywordIds = new Set(
      qualifications.flatMap((qualification) =>
        qualification.businessKeywordId === null ? [] : [qualification.businessKeywordId]
      )
    );

    if (
      categories.some(
        (category) =>
          category.qualificationPolicy !== "OPEN" && !approvedCategoryIds.has(category.id)
      ) ||
      keywords.some(
        (keyword) => keyword.qualificationPolicy !== "OPEN" && !approvedKeywordIds.has(keyword.id)
      )
    ) {
      throw this.conflict("error.shop_taxonomy.qualification_required");
    }
  }

  public async getShopSelectionState(
    shopId: number,
    locale: ShopTaxonomyCatalogQuery["locale"]
  ): Promise<ShopTaxonomySelectionState> {
    return this.loadSelectionState(this.db, shopId, locale);
  }

  public async replaceShopSelection(input: {
    shopId: number;
    actorUserId: number;
    categoryIds: number[];
    keywordIds: number[];
    expectedRevision: number;
    idempotencyKey: string;
    requestFingerprint: string;
    locale: ShopTaxonomyCatalogQuery["locale"];
    categoryLimit: number;
    keywordLimit: number;
    at: Date;
  }): Promise<ShopServiceTaxonomyPayload> {
    return this.db.$transaction(
      async (tx) => {
        const replay = await tx.shopServiceTaxonomyCommand.findUnique({
          where: {
            shopId_idempotencyKey: {
              shopId: input.shopId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (replay) {
          if (replay.requestFingerprint !== input.requestFingerprint) {
            throw this.idempotencyConflict();
          }
          return replay.resultJson as unknown as ShopServiceTaxonomyPayload;
        }

        const currentState = await tx.shopServiceTaxonomyState.findUnique({
          where: { shopId: input.shopId }
        });
        const currentRevision = currentState?.version ?? 0;
        if (currentRevision !== input.expectedRevision) {
          throw this.versionConflict();
        }

        await new ShopTaxonomyRepository(tx).assertSelectable({
          shopId: input.shopId,
          categoryIds: input.categoryIds,
          keywordIds: input.keywordIds,
          at: input.at
        });

        const previousKeywords = await tx.shopBusinessKeyword.findMany({
          where: { shopId: input.shopId, deletedAt: null },
          select: { businessKeywordId: true }
        });
        const nextKeywordIds = new Set(input.keywordIds);
        const removedKeywordIds = previousKeywords
          .map((selection) => selection.businessKeywordId)
          .filter((id) => !nextKeywordIds.has(id))
          .sort((a, b) => a - b);

        await tx.shopBusinessKeyword.updateMany({
          where: {
            shopId: input.shopId,
            deletedAt: null,
            businessKeywordId: { notIn: input.keywordIds }
          },
          data: { deletedAt: input.at }
        });
        await tx.shopServiceCategory.updateMany({
          where: {
            shopId: input.shopId,
            deletedAt: null,
            categoryId: { notIn: input.categoryIds }
          },
          data: { deletedAt: input.at }
        });

        for (const categoryId of input.categoryIds) {
          const existing = await tx.shopServiceCategory.findFirst({
            where: { shopId: input.shopId, categoryId },
            orderBy: { id: "desc" }
          });
          if (existing) {
            await tx.shopServiceCategory.update({
              where: { id: existing.id },
              data: { selectedByUserId: input.actorUserId, deletedAt: null }
            });
          } else {
            await tx.shopServiceCategory.create({
              data: { shopId: input.shopId, categoryId, selectedByUserId: input.actorUserId }
            });
          }
        }

        for (const businessKeywordId of input.keywordIds) {
          const existing = await tx.shopBusinessKeyword.findFirst({
            where: { shopId: input.shopId, businessKeywordId },
            orderBy: { id: "desc" }
          });
          if (existing) {
            await tx.shopBusinessKeyword.update({
              where: { id: existing.id },
              data: { selectedByUserId: input.actorUserId, deletedAt: null }
            });
          } else {
            await tx.shopBusinessKeyword.create({
              data: { shopId: input.shopId, businessKeywordId, selectedByUserId: input.actorUserId }
            });
          }
        }

        const resultingVersion = currentRevision + 1;
        if (currentState) {
          const updated = await tx.shopServiceTaxonomyState.updateMany({
            where: { shopId: input.shopId, version: input.expectedRevision, deletedAt: null },
            data: { version: resultingVersion }
          });
          if (updated.count !== 1) throw this.versionConflict();
        } else {
          await tx.shopServiceTaxonomyState.create({
            data: { shopId: input.shopId, version: resultingVersion }
          });
        }

        const selected = await this.loadSelectionState(tx, input.shopId, input.locale);
        const result: ShopServiceTaxonomyPayload = {
          ...selected,
          categoryLimit: input.categoryLimit,
          keywordLimit: input.keywordLimit,
          removedKeywordIds
        };

        await tx.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "merchant_admin.shop.service_taxonomy.replace",
            targetType: "Shop",
            targetId: input.shopId,
            metadata: {
              beforeRevision: currentRevision,
              afterRevision: resultingVersion,
              categoryIds: input.categoryIds,
              keywordIds: input.keywordIds,
              removedKeywordIds
            }
          }
        });
        await tx.shopServiceTaxonomyCommand.create({
          data: {
            shopId: input.shopId,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            resultingVersion,
            resultJson: result as unknown as Prisma.InputJsonObject
          }
        });

        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  private async loadSelectionState(
    db: Pick<
      Prisma.TransactionClient,
      "shopServiceTaxonomyState" | "shopServiceCategory" | "shopBusinessKeyword"
    >,
    shopId: number,
    localeCode: ShopTaxonomyCatalogQuery["locale"]
  ): Promise<ShopTaxonomySelectionState> {
    const locale = LOCALE_TO_ENUM[localeCode];
    const [state, categorySelections, keywordSelections] = await Promise.all([
      db.shopServiceTaxonomyState.findUnique({ where: { shopId } }),
      db.shopServiceCategory.findMany({
        where: { shopId, deletedAt: null },
        select: {
          category: {
            select: {
              id: true,
              code: true,
              qualificationPolicy: true,
              translations: {
                where: { locale, deletedAt: null },
                select: { name: true },
                take: 1
              }
            }
          }
        },
        orderBy: [{ category: { sortOrder: "asc" } }, { id: "asc" }]
      }),
      db.shopBusinessKeyword.findMany({
        where: { shopId, deletedAt: null },
        select: {
          businessKeyword: {
            select: {
              id: true,
              code: true,
              categoryId: true,
              qualificationPolicy: true,
              translations: {
                where: { locale, deletedAt: null },
                select: { label: true },
                take: 1
              }
            }
          }
        },
        orderBy: [{ businessKeyword: { sortOrder: "asc" } }, { id: "asc" }]
      })
    ]);

    return {
      revision: state?.version ?? 0,
      selectedCategories: categorySelections.flatMap(({ category }) =>
        category.translations[0]
          ? [
              {
                id: category.id,
                code: category.code,
                label: category.translations[0].name,
                qualificationPolicy: category.qualificationPolicy
              }
            ]
          : []
      ),
      selectedKeywords: keywordSelections.flatMap(({ businessKeyword }) =>
        businessKeyword.translations[0]
          ? [
              {
                id: businessKeyword.id,
                code: businessKeyword.code,
                categoryId: businessKeyword.categoryId,
                label: businessKeyword.translations[0].label,
                qualificationPolicy: businessKeyword.qualificationPolicy
              }
            ]
          : []
      )
    };
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_TAXONOMY_SELECTION_CONFLICT,
      message,
      statusCode: 409
    });
  }

  private versionConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_TAXONOMY_VERSION_CONFLICT,
      message: "error.shop_taxonomy.version_conflict",
      statusCode: 409
    });
  }

  private idempotencyConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_TAXONOMY_IDEMPOTENCY_CONFLICT,
      message: "error.shop_taxonomy.idempotency_conflict",
      statusCode: 409
    });
  }
}
