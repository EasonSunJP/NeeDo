import { createHash } from "node:crypto";
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
import type { ShopServiceTaxonomyPayload } from "../repositories/shop-taxonomy.repository";
import type { PaginatedResponse } from "../utils/pagination";
import type {
  ShopTaxonomyCatalogQuery,
  ShopTaxonomyReplaceBody
} from "../validators/shop-taxonomy.validator";
import type { AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

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

  public async getShopTaxonomy(
    actor: AuthenticatedAccessContext,
    locale: ShopTaxonomyCatalogQuery["locale"]
  ): Promise<ShopServiceTaxonomyPayload> {
    const shopId = requireMerchantShopId(actor);
    const [selection, quota] = await Promise.all([
      this.requireRepository().getShopSelectionState(shopId, locale),
      this.quotaPolicy.resolve(shopId)
    ]);

    return {
      ...selection,
      categoryLimit: quota.categoryLimit,
      keywordLimit: quota.keywordLimit,
      removedKeywordIds: []
    };
  }

  public async replaceShopTaxonomy(
    actor: AuthenticatedAccessContext,
    body: ShopTaxonomyReplaceBody,
    locale: ShopTaxonomyCatalogQuery["locale"],
    at: Date = new Date()
  ): Promise<ShopServiceTaxonomyPayload> {
    const shopId = requireMerchantShopId(actor);
    const categoryIds = [...body.categoryIds].sort((a, b) => a - b);
    const keywordIds = [...body.keywordIds].sort((a, b) => a - b);
    const quota = await this.assertSelectionPolicy({ shopId, categoryIds, keywordIds, at });
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ categoryIds, keywordIds, expectedRevision: body.expectedRevision }))
      .digest("hex");

    return this.requireRepository().replaceShopSelection({
      shopId,
      actorUserId: actor.userId,
      categoryIds,
      keywordIds,
      expectedRevision: body.expectedRevision,
      idempotencyKey: body.idempotencyKey,
      requestFingerprint,
      locale,
      categoryLimit: quota.categoryLimit,
      keywordLimit: quota.keywordLimit,
      at
    });
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
