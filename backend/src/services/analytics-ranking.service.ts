import { ERROR_CODES } from "../constants/error-codes";
import {
  AnalyticsRankingIncompleteEvidenceError,
  type AnalyticsRankingResponse
} from "../domain/analytics-ranking";
import { resolveDashboardWindow } from "../domain/dashboard-period";
import type { AnalyticsRankingRepositoryPort } from "../repositories/analytics-ranking.repository";
import type {
  AnalyticsRankingParams,
  AnalyticsRankingQuery
} from "../validators/analytics-ranking.validator";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { assertActivePlatformIdentity } from "./platform-identity-scope";

type AnalyticsRankingAudit = Pick<AuditLogService, "record">;

export class AnalyticsRankingService {
  public constructor(
    private readonly repository: AnalyticsRankingRepositoryPort,
    private readonly auditLog: AnalyticsRankingAudit,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async list(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    params: AnalyticsRankingParams,
    query: AnalyticsRankingQuery
  ): Promise<AnalyticsRankingResponse> {
    assertActivePlatformIdentity(actor);
    const evaluatedAt = this.now();
    const window = resolveDashboardWindow(query, evaluatedAt);
    const categoryId = query.categoryId ?? null;
    if (
      categoryId !== null &&
      (await this.repository.findActiveCategoryById(categoryId)) === null
    ) {
      throw new AppError({
        code: ERROR_CODES.ANALYTICS_RANKING_CATEGORY_NOT_FOUND,
        message: "error.analytics_ranking.category_not_found",
        statusCode: 404
      });
    }

    try {
      const page = await this.repository.listRankings({
        kind: params.kind,
        metric: query.metric,
        window,
        evaluatedAt,
        city: query.city ?? null,
        categoryId,
        page: query.page,
        pageSize: query.pageSize
      });
      await this.auditLog.record({
        actor,
        context,
        action: "backoffice.analytics_ranking.read",
        targetType: "analytics_ranking",
        targetId: null,
        metadata: {
          kind: params.kind,
          metric: query.metric,
          period: window.period,
          from: window.fromDate,
          to: window.toDate,
          city: query.city ?? null,
          categoryId,
          page: query.page,
          pageSize: query.pageSize,
          resultCount: page.list.length
        }
      });
      return {
        ...page,
        dataStatus: "ready",
        filter: {
          kind: params.kind,
          metric: query.metric,
          period: window.period,
          from: window.fromDate,
          to: window.toDate,
          timeZone: window.timeZone,
          city: query.city ?? null,
          categoryId,
          evaluatedAt: evaluatedAt.toISOString()
        }
      };
    } catch (error) {
      if (error instanceof AnalyticsRankingIncompleteEvidenceError) {
        throw new AppError({
          code: ERROR_CODES.ANALYTICS_RANKING_INCOMPLETE_EVIDENCE,
          message: "error.analytics_ranking.incomplete_evidence",
          statusCode: 409
        });
      }
      throw error;
    }
  }
}
