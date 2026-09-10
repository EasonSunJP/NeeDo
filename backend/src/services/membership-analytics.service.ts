import { ERROR_CODES } from "../constants/error-codes";
import {
  MembershipAnalyticsIncompleteHistoryError,
  type MemberAnalyticsListPayload,
  type MembershipAnalyticsFilter,
  type MembershipAnalyticsRepositoryInput,
  type MembershipTrendPayload
} from "../domain/membership-analytics";
import { resolveDashboardWindow, type DashboardPeriodQuery } from "../domain/dashboard-period";
import type { MembershipAnalyticsRepositoryPort } from "../repositories/membership-analytics.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

const platformIdentityTypes = new Set(["platform", "platform_admin"]);
import { requireMerchantShopId } from "./merchant-shop-scope";
import type {
  BackofficeMembershipListQuery,
  BackofficeMembershipTrendQuery,
  MerchantMembershipListQuery,
  MerchantMembershipTrendQuery
} from "../validators/membership-analytics.validator";

type MembershipAnalyticsAudit = Pick<AuditLogService, "record">;

export class MembershipAnalyticsService {
  public constructor(
    private readonly repository: MembershipAnalyticsRepositoryPort,
    private readonly auditLog: MembershipAnalyticsAudit,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getBackofficeTrend(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: BackofficeMembershipTrendQuery
  ): Promise<MembershipTrendPayload> {
    this.assertPlatformIdentity(actor);
    return this.trend(
      actor,
      context,
      query,
      { kind: "platform" },
      query.city ?? null,
      "backoffice"
    );
  }

  public async getMerchantTrend(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: MerchantMembershipTrendQuery
  ): Promise<MembershipTrendPayload> {
    const shopId = requireMerchantShopId(actor);
    return this.trend(actor, context, query, { kind: "shop", shopId }, null, "merchant");
  }

  public async listBackofficeMembers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: BackofficeMembershipListQuery
  ): Promise<MemberAnalyticsListPayload> {
    this.assertPlatformIdentity(actor);
    return this.list(actor, context, query, { kind: "platform" }, query.city ?? null, "backoffice");
  }

  public async listMerchantMembers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: MerchantMembershipListQuery
  ): Promise<MemberAnalyticsListPayload> {
    const shopId = requireMerchantShopId(actor);
    return this.list(actor, context, query, { kind: "shop", shopId }, null, "merchant");
  }

  private async trend(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: DashboardPeriodQuery,
    scope: MembershipAnalyticsRepositoryInput["scope"],
    city: string | null,
    auditScope: "backoffice" | "merchant"
  ): Promise<MembershipTrendPayload> {
    const evaluatedAt = this.now();
    const window = resolveDashboardWindow(query, evaluatedAt);
    const input = { scope, city, window, evaluatedAt };
    try {
      const series = await this.repository.getTrend(input);
      await this.recordRead(actor, context, {
        action: `${auditScope}.members.analytics.trend.read`,
        scope,
        city,
        window,
        page: 1,
        pageSize: 0,
        hasNeedoId: false,
        hasNickname: false,
        resultCount: series.reduce((count, item) => count + item.points.length, 0)
      });
      return { dataStatus: "ready", filter: this.filter(input), series };
    } catch (error) {
      this.rethrowIncomplete(error);
    }
  }

  private async list(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: DashboardPeriodQuery & {
      needoId?: string;
      nickname?: string;
      page: number;
      pageSize: number;
    },
    scope: MembershipAnalyticsRepositoryInput["scope"],
    city: string | null,
    auditScope: "backoffice" | "merchant"
  ): Promise<MemberAnalyticsListPayload> {
    const evaluatedAt = this.now();
    const window = resolveDashboardWindow(query, evaluatedAt);
    try {
      const result = await this.repository.listAddedMembers({
        scope,
        city,
        window,
        evaluatedAt,
        needoId: query.needoId,
        nickname: query.nickname,
        page: query.page,
        pageSize: query.pageSize
      });
      await this.recordRead(actor, context, {
        action: `${auditScope}.members.analytics.list.read`,
        scope,
        city,
        window,
        page: query.page,
        pageSize: query.pageSize,
        hasNeedoId: query.needoId !== undefined,
        hasNickname: query.nickname !== undefined,
        resultCount: result.list.length
      });
      return result;
    } catch (error) {
      this.rethrowIncomplete(error);
    }
  }

  private filter(input: MembershipAnalyticsRepositoryInput): MembershipAnalyticsFilter {
    return {
      period: input.window.period,
      from: input.window.fromDate,
      to: input.window.toDate,
      previousFrom: input.window.previousFromDate,
      previousTo: input.window.previousToDate,
      timeZone: input.window.timeZone,
      granularity: input.window.granularity,
      city: input.city,
      evaluatedAt: input.evaluatedAt.toISOString()
    };
  }

  private async recordRead(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: {
      action: string;
      scope: MembershipAnalyticsRepositoryInput["scope"];
      city: string | null;
      window: ReturnType<typeof resolveDashboardWindow>;
      page: number;
      pageSize: number;
      hasNeedoId: boolean;
      hasNickname: boolean;
      resultCount: number;
    }
  ): Promise<void> {
    const shopId = input.scope.kind === "shop" ? input.scope.shopId : null;
    await this.auditLog.record({
      actor,
      context,
      action: input.action,
      targetType: "MembershipAnalytics",
      targetId: shopId,
      metadata: {
        period: input.window.period,
        from: input.window.fromDate,
        to: input.window.toDate,
        city: input.city,
        shopId,
        page: input.page,
        pageSize: input.pageSize,
        hasNeedoId: input.hasNeedoId,
        hasNickname: input.hasNickname,
        resultCount: input.resultCount
      }
    });
  }

  private assertPlatformIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityType &&
      platformIdentityTypes.has(actor.currentIdentityType) &&
      (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform")
    ) {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private rethrowIncomplete(error: unknown): never {
    if (error instanceof MembershipAnalyticsIncompleteHistoryError) {
      throw new AppError({
        code: ERROR_CODES.MEMBERSHIP_ANALYTICS_INCOMPLETE_HISTORY,
        message: "error.membership_analytics.incomplete_history",
        statusCode: 409
      });
    }
    throw error;
  }
}
