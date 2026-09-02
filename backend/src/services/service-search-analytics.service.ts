import { ERROR_CODES } from "../constants/error-codes";
import type {
  AliasMutationInput,
  CategoryMutationInput,
  KeywordMutationInput,
  SearchAnalyticsFilter,
  SearchKeywordAliasRecord,
  ServiceSearchAnalyticsRepositoryPort,
  ServiceTaxonomyCategoryRecord,
  ServiceTaxonomyKeywordRecord,
  TaxonomyListInput,
  TaxonomyMutationResult
} from "../repositories/service-search-analytics.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { normalizeSearchKeyword } from "./search-query-recorder.service";

type CategoryRequest = Omit<CategoryMutationInput, "actorUserId" | "audit"> & { reason: string };
type KeywordRequest = Omit<KeywordMutationInput, "actorUserId" | "audit"> & { reason: string };
type AliasRequest = Omit<AliasMutationInput, "actorUserId" | "audit" | "normalizedAlias"> & {
  reason: string;
};

export interface SearchTrendPayload {
  normalization: "global_max_0_100";
  timezone: "Asia/Tokyo";
  series: Array<{
    keyword: string;
    totalCount: number;
    points: Array<{ date: string; rawCount: number; normalizedIndex: number }>;
  }>;
}

export class ServiceSearchAnalyticsService {
  public constructor(
    private readonly repository: ServiceSearchAnalyticsRepositoryPort,
    private readonly auditInputFactory: Pick<AuditLogService, "createInput">
  ) {}

  public listCategories(
    actor: AuthenticatedAccessContext,
    input: TaxonomyListInput
  ): Promise<PaginatedResponse<ServiceTaxonomyCategoryRecord>> {
    this.assertPlatformIdentity(actor);
    return this.repository.listCategories(input);
  }

  public listKeywords(
    actor: AuthenticatedAccessContext,
    categoryId: number,
    input: TaxonomyListInput
  ): Promise<PaginatedResponse<ServiceTaxonomyKeywordRecord>> {
    this.assertPlatformIdentity(actor);
    return this.repository.listKeywords({ ...input, categoryId });
  }

  public listAliases(
    actor: AuthenticatedAccessContext,
    businessKeywordId: number,
    input: TaxonomyListInput
  ): Promise<PaginatedResponse<SearchKeywordAliasRecord>> {
    this.assertPlatformIdentity(actor);
    return this.repository.listAliases({ ...input, businessKeywordId });
  }

  public async createCategory(
    actor: AuthenticatedAccessContext,
    input: CategoryRequest,
    context: AuthRequestContext
  ): Promise<ServiceTaxonomyCategoryRecord> {
    this.assertPlatformIdentity(actor);
    return this.unwrap(
      await this.repository.createCategory({
        ...input,
        actorUserId: actor.userId,
        audit: this.audit(actor, context, "backoffice.service_taxonomy.category_created", "Category", input.reason)
      })
    );
  }

  public async updateCategory(
    actor: AuthenticatedAccessContext,
    id: number,
    input: CategoryRequest,
    context: AuthRequestContext
  ): Promise<ServiceTaxonomyCategoryRecord> {
    this.assertPlatformIdentity(actor);
    return this.unwrap(
      await this.repository.updateCategory(id, {
        ...input,
        actorUserId: actor.userId,
        audit: this.audit(actor, context, "backoffice.service_taxonomy.category_updated", "Category", input.reason, id)
      })
    );
  }

  public async createKeyword(
    actor: AuthenticatedAccessContext,
    input: KeywordRequest,
    context: AuthRequestContext
  ): Promise<ServiceTaxonomyKeywordRecord> {
    this.assertPlatformIdentity(actor);
    return this.unwrap(
      await this.repository.createKeyword({
        ...input,
        actorUserId: actor.userId,
        audit: this.audit(actor, context, "backoffice.service_taxonomy.keyword_created", "BusinessKeyword", input.reason)
      })
    );
  }

  public async updateKeyword(
    actor: AuthenticatedAccessContext,
    id: number,
    input: KeywordRequest,
    context: AuthRequestContext
  ): Promise<ServiceTaxonomyKeywordRecord> {
    this.assertPlatformIdentity(actor);
    return this.unwrap(
      await this.repository.updateKeyword(id, {
        ...input,
        actorUserId: actor.userId,
        audit: this.audit(actor, context, "backoffice.service_taxonomy.keyword_updated", "BusinessKeyword", input.reason, id)
      })
    );
  }

  public async createAlias(
    actor: AuthenticatedAccessContext,
    input: AliasRequest,
    context: AuthRequestContext
  ): Promise<SearchKeywordAliasRecord> {
    this.assertPlatformIdentity(actor);
    return this.unwrap(
      await this.repository.createAlias({
        ...input,
        normalizedAlias: normalizeSearchKeyword(input.alias),
        actorUserId: actor.userId,
        audit: this.audit(actor, context, "backoffice.service_taxonomy.alias_created", "SearchKeywordAlias", input.reason)
      })
    );
  }

  public async updateAlias(
    actor: AuthenticatedAccessContext,
    id: number,
    input: AliasRequest,
    context: AuthRequestContext
  ): Promise<SearchKeywordAliasRecord> {
    this.assertPlatformIdentity(actor);
    return this.unwrap(
      await this.repository.updateAlias(id, {
        ...input,
        normalizedAlias: normalizeSearchKeyword(input.alias),
        actorUserId: actor.userId,
        audit: this.audit(actor, context, "backoffice.service_taxonomy.alias_updated", "SearchKeywordAlias", input.reason, id)
      })
    );
  }

  public async topKeywords(actor: AuthenticatedAccessContext, filter: SearchAnalyticsFilter) {
    this.assertPlatformIdentity(actor);
    return {
      timezone: "Asia/Tokyo" as const,
      list: await this.repository.topKeywords(filter)
    };
  }

  public async keywordTrend(
    actor: AuthenticatedAccessContext,
    filter: SearchAnalyticsFilter,
    keywords: string[]
  ): Promise<SearchTrendPayload> {
    this.assertPlatformIdentity(actor);
    const normalizedKeywords = [...new Set(keywords.map(normalizeSearchKeyword))];
    const rows = await this.repository.keywordTrend(filter, normalizedKeywords);
    const buckets = this.dateBuckets(filter.startAt, filter.endAt);
    const countByKey = new Map(
      rows.map((row) => [`${row.normalizedKeyword}\0${row.date}`, row.searchCount])
    );
    const globalMax = Math.max(0, ...rows.map((row) => row.searchCount));
    return {
      normalization: "global_max_0_100",
      timezone: "Asia/Tokyo",
      series: normalizedKeywords.map((keyword) => {
        const points = buckets.map((date) => {
          const rawCount = countByKey.get(`${keyword}\0${date}`) ?? 0;
          return {
            date,
            rawCount,
            normalizedIndex: globalMax === 0 ? 0 : Math.round((rawCount / globalMax) * 100)
          };
        });
        return {
          keyword,
          totalCount: points.reduce((sum, point) => sum + point.rawCount, 0),
          points
        };
      })
    };
  }

  private dateBuckets(startAt: Date, endAt: Date): string[] {
    const tokyoDate = (value: Date): string =>
      new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const first = tokyoDate(startAt);
    const last = tokyoDate(new Date(endAt.getTime() - 1));
    const cursor = new Date(`${first}T00:00:00.000Z`);
    const end = new Date(`${last}T00:00:00.000Z`);
    const dates: string[] = [];
    while (cursor <= end && dates.length < 367) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private audit(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetType: string,
    reason: string,
    targetId?: number
  ) {
    return this.auditInputFactory.createInput({
      actor,
      context,
      action,
      targetType,
      targetId,
      metadata: { reason }
    });
  }

  private unwrap<T>(result: TaxonomyMutationResult<T>): T {
    if (result.outcome === "saved") return result.value;
    if (result.outcome === "not_found") {
      throw new AppError({
        code: ERROR_CODES.SERVICE_TAXONOMY_NOT_FOUND,
        message: "error.service_taxonomy.not_found",
        statusCode: 404
      });
    }
    if (result.outcome === "invalid_relation") {
      throw new AppError({
        code: ERROR_CODES.SERVICE_TAXONOMY_RELATION_INVALID,
        message: "error.service_taxonomy.invalid_relation",
        statusCode: 422
      });
    }
    throw new AppError({
      code: ERROR_CODES.SERVICE_TAXONOMY_CONFLICT,
      message: "error.service_taxonomy.conflict",
      statusCode: 409
    });
  }

  private assertPlatformIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityScopeType !== "global" && actor.currentIdentityScopeType !== "platform") {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }
}
