import type {
  LiveDashboardOrderSummary,
  LiveDashboardSnapshotFacts,
  LiveDashboardScope
} from "../domain/live-dashboard";
import type {
  AdministrativeRegionListItem,
  AdministrativeRegionRepositoryPort
} from "../repositories/administrative-region.repository";
import type { LiveDashboardRepositoryPort } from "../repositories/live-dashboard.repository";
import type { LiveDashboardQuery } from "../validators/live-dashboard.validator";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type {
  LiveDashboardCachePort,
  LiveDashboardCacheStatus
} from "./live-dashboard-cache.service";

export type LiveDashboardLocale = "zh-CN" | "zh-TW" | "ja" | "en" | "ko";

interface LiveDashboardBreadcrumb {
  level: "country" | "admin1" | "admin2";
  code: string;
  name: string;
}

interface LiveDashboardResponseScope {
  country: "JP";
  admin1: string | null;
  admin2: string | null;
  breadcrumbs: LiveDashboardBreadcrumb[];
}

interface SerializedOrderSummary extends Omit<LiveDashboardOrderSummary, "occurredAt"> {
  occurredAt: string;
}

interface CachedLiveDashboardFacts extends Omit<
  LiveDashboardSnapshotFacts,
  "evaluatedAt" | "realtimeOrders" | "activity"
> {
  evaluatedAt: string;
  realtimeOrders: Omit<LiveDashboardSnapshotFacts["realtimeOrders"], "list"> & {
    list: SerializedOrderSummary[];
  };
  activity: SerializedOrderSummary[];
}

export interface LiveDashboardSnapshotResponse extends Omit<CachedLiveDashboardFacts, "scope"> {
  scope: LiveDashboardResponseScope;
  cachedAt: string;
  freshnessSeconds: number;
  cacheStatus: LiveDashboardCacheStatus;
}

type LiveDashboardAudit = Pick<AuditLogService, "record">;

const countryNames: Record<LiveDashboardLocale, string> = {
  "zh-CN": "日本",
  "zh-TW": "日本",
  ja: "日本",
  en: "Japan",
  ko: "일본"
};

export class LiveDashboardService {
  public constructor(
    private readonly repository: LiveDashboardRepositoryPort,
    private readonly regions: AdministrativeRegionRepositoryPort,
    private readonly cache: LiveDashboardCachePort,
    private readonly auditLog: LiveDashboardAudit,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getSnapshot(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    query: LiveDashboardQuery,
    locale: LiveDashboardLocale
  ): Promise<LiveDashboardSnapshotResponse> {
    const hierarchy = await this.resolveHierarchy(query, locale);
    const requestedScope: LiveDashboardScope = {
      countryCode: query.country,
      admin1Code: query.admin1 ?? null,
      admin2Code: query.admin2 ?? null
    };
    const scopeKey = `${query.country}:${query.admin1 ?? "-"}:${query.admin2 ?? "-"}:${query.period}`;
    const cached = await this.cache.getOrCreate<CachedLiveDashboardFacts>(scopeKey, async () => {
      const evaluatedAt = this.now();
      const repositoryFacts = await this.repository.getSnapshotFacts({
        scope: requestedScope,
        period: query.period,
        evaluatedAt
      });
      this.assertScope(repositoryFacts.scope, requestedScope);
      return this.serializeFacts(repositoryFacts);
    });
    this.assertScope(cached.value.scope, requestedScope);

    const now = this.now();
    const freshnessSeconds = Math.max(
      0,
      Math.floor((now.getTime() - cached.cachedAt.getTime()) / 1_000)
    );
    const childNames = new Map(hierarchy.children.map((region) => [region.code, region.name]));
    const projectMoney = (money: LiveDashboardSnapshotFacts["confirmedPayments"]) => ({
      jpy: money.jpy,
      ndp: money.ndp,
      testNdp: money.testNdp
    });
    const projectOrder = (order: SerializedOrderSummary): SerializedOrderSummary => ({
      orderNo: order.orderNo,
      status: order.status,
      serviceName: order.serviceName,
      amountJpy: order.amountJpy,
      occurredAt: order.occurredAt
    });
    const projectRanking = (item: LiveDashboardSnapshotFacts["serviceRanking"][number]) => ({
      rank: item.rank,
      entityPublicId: item.entityPublicId,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      gmvJpy: item.gmvJpy,
      completedCount: item.completedCount
    });
    const response: LiveDashboardSnapshotResponse = {
      scope: {
        country: query.country,
        admin1: query.admin1 ?? null,
        admin2: query.admin2 ?? null,
        breadcrumbs: hierarchy.breadcrumbs
      },
      evaluatedAt: cached.value.evaluatedAt,
      cachedAt: cached.cachedAt.toISOString(),
      freshnessSeconds,
      cacheStatus: cached.cacheStatus,
      children: cached.value.children.map((child) => ({
        code: child.code,
        name: childNames.get(child.code) ?? child.name,
        orderCount: child.orderCount,
        confirmedPayments: projectMoney(child.confirmedPayments)
      })),
      headline: {
        newOrders: cached.value.headline.newOrders,
        completedOrders: cached.value.headline.completedOrders,
        newCustomers: cached.value.headline.newCustomers,
        onboardedTechnicians: cached.value.headline.onboardedTechnicians
      },
      confirmedPayments: projectMoney(cached.value.confirmedPayments),
      orders: {
        total: cached.value.orders.total,
        serviceGmv: projectMoney(cached.value.orders.serviceGmv),
        platformNetRevenue: projectMoney(cached.value.orders.platformNetRevenue),
        agentCommission: cached.value.orders.agentCommission
          ? projectMoney(cached.value.orders.agentCommission)
          : null
      },
      realtimeOrders: {
        list: cached.value.realtimeOrders.list.map(projectOrder),
        total: cached.value.realtimeOrders.total,
        page: 1,
        page_size: 20
      },
      activity: cached.value.activity.map(projectOrder),
      trend: cached.value.trend.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        orderCount: bucket.orderCount,
        confirmedPayments: projectMoney(bucket.confirmedPayments)
      })),
      serviceRanking: cached.value.serviceRanking.map(projectRanking),
      technicianRanking: cached.value.technicianRanking.map(projectRanking),
      coverage: {
        total: cached.value.coverage.total,
        attributed: cached.value.coverage.attributed,
        unresolved: cached.value.coverage.unresolved,
        completenessPercent: cached.value.coverage.completenessPercent
      }
    };

    await this.auditLog.record({
      actor,
      context,
      action: "backoffice.dashboard.live_snapshot.read",
      targetType: "live_dashboard_snapshot",
      targetId: null,
      metadata: {
        country: query.country,
        admin1: query.admin1 ?? null,
        admin2: query.admin2 ?? null,
        period: query.period,
        cacheStatus: cached.cacheStatus
      }
    });
    return response;
  }

  private async resolveHierarchy(
    query: LiveDashboardQuery,
    locale: LiveDashboardLocale
  ): Promise<{ breadcrumbs: LiveDashboardBreadcrumb[]; children: AdministrativeRegionListItem[] }> {
    if (query.admin1 && query.admin2) {
      await this.regions.resolveVerifiedScope({
        countryCode: query.country,
        admin1Code: query.admin1,
        admin2Code: query.admin2
      });
    }
    const admin1Regions = await this.regions.listChildren({ country: query.country, locale });
    const breadcrumbs: LiveDashboardBreadcrumb[] = [
      { level: "country", code: query.country, name: countryNames[locale] }
    ];
    if (!query.admin1) return { breadcrumbs, children: admin1Regions };

    const admin1 = admin1Regions.find(
      (region) => region.level === "admin1" && region.code === query.admin1
    );
    if (!admin1) throw this.invalidHierarchyError();
    breadcrumbs.push({ level: "admin1", code: admin1.code, name: admin1.name });

    const admin2Regions = await this.regions.listChildren({
      country: query.country,
      parent: admin1.code,
      locale
    });
    if (!query.admin2) return { breadcrumbs, children: admin2Regions };

    const admin2 = admin2Regions.find(
      (region) =>
        region.level === "admin2" &&
        region.code === query.admin2 &&
        region.parentCode === admin1.code
    );
    if (!admin2) throw this.invalidHierarchyError();
    breadcrumbs.push({ level: "admin2", code: admin2.code, name: admin2.name });
    return { breadcrumbs, children: [] };
  }

  private serializeFacts(facts: LiveDashboardSnapshotFacts): CachedLiveDashboardFacts {
    const serializeOrder = (order: LiveDashboardOrderSummary): SerializedOrderSummary => ({
      orderNo: order.orderNo,
      status: order.status,
      serviceName: order.serviceName,
      amountJpy: order.amountJpy,
      occurredAt: order.occurredAt.toISOString()
    });
    return {
      evaluatedAt: facts.evaluatedAt.toISOString(),
      scope: { ...facts.scope },
      children: facts.children.map((child) => ({
        code: child.code,
        name: child.name,
        orderCount: child.orderCount,
        confirmedPayments: { ...child.confirmedPayments }
      })),
      headline: { ...facts.headline },
      confirmedPayments: { ...facts.confirmedPayments },
      orders: {
        ...facts.orders,
        serviceGmv: { ...facts.orders.serviceGmv },
        platformNetRevenue: { ...facts.orders.platformNetRevenue },
        agentCommission: facts.orders.agentCommission ? { ...facts.orders.agentCommission } : null
      },
      realtimeOrders: {
        list: facts.realtimeOrders.list.map(serializeOrder),
        total: facts.realtimeOrders.total,
        page: 1,
        page_size: 20
      },
      activity: facts.activity.map(serializeOrder),
      trend: facts.trend.map((bucket) => ({
        ...bucket,
        confirmedPayments: { ...bucket.confirmedPayments }
      })),
      serviceRanking: facts.serviceRanking.map((item) => ({ ...item })),
      technicianRanking: facts.technicianRanking.map((item) => ({ ...item })),
      coverage: { ...facts.coverage }
    };
  }

  private assertScope(actual: LiveDashboardScope, expected: LiveDashboardScope): void {
    if (
      actual.countryCode !== expected.countryCode ||
      actual.admin1Code !== expected.admin1Code ||
      actual.admin2Code !== expected.admin2Code
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.live_dashboard.scope_mismatch",
        statusCode: 409
      });
    }
  }

  private invalidHierarchyError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.administrative_region.invalid_hierarchy",
      statusCode: 400
    });
  }
}
