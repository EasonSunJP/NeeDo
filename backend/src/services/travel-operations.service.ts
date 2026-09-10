import type { AppConfig } from "../config/env";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { PaginatedResponse } from "../utils/pagination";
import type { TravelFarePolicyListQuery } from "../validators/travel-operations.validator";
import type { RouteProviderHealthStorePort } from "./route-provider-health";

export interface OperationsTravelPolicyVersion {
  publicId: string;
  version: number;
  effectiveFrom: string;
  publishedByUserId: number;
  reason: string;
  bands: Array<{ ordinal: number; maximumDistanceMeters: number; fareAmountJpy: number }>;
  createdAt: string;
}
export interface OperationsTravelFarePolicy {
  shopId: number;
  shopPublicId: string | null;
  shopName: string;
  city: string;
  current: OperationsTravelPolicyVersion | null;
  next: OperationsTravelPolicyVersion | null;
}
export interface TravelOperationsRepositoryPort {
  listFarePolicies(input: TravelFarePolicyListQuery, at: Date): Promise<PaginatedResponse<OperationsTravelFarePolicy>>;
}

export class TravelOperationsService {
  public constructor(
    private readonly config: AppConfig,
    private readonly repository: TravelOperationsRepositoryPort,
    private readonly auditLogService: Pick<AuditLogService, "record">,
    private readonly healthStore: RouteProviderHealthStorePort,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async getProviderStatus(actor: AuthenticatedAccessContext, context: AuthRequestContext) {
    const configured = this.config.TRAVEL_ROUTE_PROVIDER === "geoapify" && Boolean(this.config.GEOAPIFY_API_KEY);
    const health = configured
      ? await this.healthStore.read(this.config.TRAVEL_ROUTE_PROVIDER)
      : { status: "unconfigured" as const, checkedAt: null };
    await this.auditLogService.record({ actor, context, action: "backoffice.travel.provider_status.read", targetType: "travel_route_provider", metadata: { providerCode: this.config.TRAVEL_ROUTE_PROVIDER, configured, status: health.status } });
    return {
      providerCode: this.config.TRAVEL_ROUTE_PROVIDER,
      status: health.status,
      configured,
      checkedAt: health.checkedAt,
      routingProfile: "drive" as const,
      estimateTtlSeconds: this.config.TRAVEL_ESTIMATE_TTL_SECONDS,
      cacheTtlSeconds: this.config.TRAVEL_ROUTE_CACHE_TTL_SECONDS
    };
  }

  public async listFarePolicies(actor: AuthenticatedAccessContext, context: AuthRequestContext, input: TravelFarePolicyListQuery) {
    await this.auditLogService.record({ actor, context, action: "backoffice.travel.fare_policies.read", targetType: "shop_travel_fare_policy", metadata: input });
    return this.repository.listFarePolicies(input, this.clock());
  }
}
