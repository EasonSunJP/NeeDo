import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type {
  ShopTaxonomyQuota,
  ShopTaxonomyQuotaPolicyPort
} from "./shop-taxonomy-quota.service";
import type {
  LocalizedBusinessKeyword,
  LocalizedServiceCategory,
  ShopTaxonomyRepositoryPort
} from "../repositories/shop-taxonomy.repository";
import type { PaginatedResponse } from "../utils/pagination";
import type { ShopTaxonomyCatalogQuery } from "../validators/shop-taxonomy.validator";

export interface ShopTaxonomyQualificationPort {
  assertSelectable(input: {
    shopId: number;
    categoryIds: number[];
    keywordIds: number[];
    at: Date;
  }): Promise<void>;
}

export type ShopTaxonomySelectionPolicyInput = {
  shopId: number;
  categoryIds: number[];
  keywordIds: number[];
  at: Date;
};

export class ShopTaxonomyService {
  public constructor(
    private readonly quotaPolicy: ShopTaxonomyQuotaPolicyPort,
    private readonly qualificationPort: ShopTaxonomyQualificationPort,
    private readonly repository?: ShopTaxonomyRepositoryPort
  ) {}

  public async listCategories(
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedServiceCategory>> {
    return this.requireRepository().listCategories(input);
  }

  public async listKeywords(
    categoryId: number,
    input: ShopTaxonomyCatalogQuery
  ): Promise<PaginatedResponse<LocalizedBusinessKeyword>> {
    return this.requireRepository().listKeywords(categoryId, input);
  }

  public async assertSelectionPolicy(
    input: ShopTaxonomySelectionPolicyInput
  ): Promise<ShopTaxonomyQuota> {
    const categoryIds = [...new Set(input.categoryIds)].sort((a, b) => a - b);
    const keywordIds = [...new Set(input.keywordIds)].sort((a, b) => a - b);

    if (categoryIds.length !== input.categoryIds.length || keywordIds.length !== input.keywordIds.length) {
      throw this.validationError("error.shop_taxonomy.duplicate_selection");
    }

    const quota = await this.quotaPolicy.resolve(input.shopId);

    if (categoryIds.length > quota.categoryLimit) {
      throw this.validationError("error.shop_taxonomy.category_limit", {
        limit: quota.categoryLimit
      });
    }

    if (keywordIds.length > quota.keywordLimit) {
      throw this.validationError("error.shop_taxonomy.keyword_limit", {
        limit: quota.keywordLimit
      });
    }

    await this.qualificationPort.assertSelectable({
      shopId: input.shopId,
      categoryIds,
      keywordIds,
      at: input.at
    });

    return quota;
  }

  private validationError(message: string, data?: unknown): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 400,
      data
    });
  }

  private requireRepository(): ShopTaxonomyRepositoryPort {
    if (!this.repository) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.internal_server_error",
        statusCode: 500
      });
    }
    return this.repository;
  }
}
