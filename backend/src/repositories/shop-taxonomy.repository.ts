import type { PrismaClient, TaxonomyLocale } from "@prisma/client";
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

export interface ShopTaxonomyRepositoryPort extends ShopTaxonomyQualificationPort {
  listCategories(input: ShopTaxonomyCatalogQuery): Promise<PaginatedResponse<LocalizedServiceCategory>>;
  listKeywords(
    categoryId: number,
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedBusinessKeyword>>;
}

type ShopTaxonomyPrisma = Pick<
  PrismaClient,
  "category" | "businessKeyword" | "shopServiceQualification"
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
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: input.at } }
          ],
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

    if (categories.length !== input.categoryIds.length || keywords.length !== input.keywordIds.length) {
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
        (keyword) =>
          keyword.qualificationPolicy !== "OPEN" && !approvedKeywordIds.has(keyword.id)
      )
    ) {
      throw this.conflict("error.shop_taxonomy.qualification_required");
    }
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_TAXONOMY_SELECTION_CONFLICT,
      message,
      statusCode: 409
    });
  }
}
