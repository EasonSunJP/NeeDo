import { ERROR_CODES } from "../constants/error-codes";
import type { BackofficeListQuery } from "../validators/backoffice.validator";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type BackofficeScope =
  | {
      scope: "platform";
    }
  | {
      scope: "merchant";
      shopId: number;
    };

export type BackofficeMetricTone = "good" | "warn" | "neutral";

export interface BackofficeMetricPayload {
  label: string;
  value: string;
  change: string;
  tone: BackofficeMetricTone;
}

export interface BackofficeOrderPayload {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: "unpaid";
  customerUserId: number;
  customerName: string;
  serviceId: number | null;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  fulfillmentMode: string;
  priceAmount: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeScheduleSlotPayload {
  id: number;
  serviceId: number | null;
  serviceName: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
}

export interface BackofficeFinanceSettlementPayload {
  id: number;
  bookingOrderId: number;
  orderType: "booking" | "request";
  orderNo: string;
  referenceType: string;
  referenceId: number;
  status: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  estimatedServiceGmvJpy: number;
  platformCollectedServiceAmountJpy: number;
  offlineReportedServiceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy: number;
  serviceIncomeStatus: string;
  paymentChannel: string;
  platformNdpRevenue: number;
  cRequestFeeHoldNdp: number;
  cRequestFeeActualNdp: number;
  requestFeeNdpRevenue: number;
  userRewardNdpCost: number;
  pendingHoldNdp: number;
  campaignDiscountNdp: number;
  releasedNdp: number;
  penaltyNdp: number;
  compensationToUserNdp: number;
  technicianEstimatedIncomeJpy: number;
  shopEstimatedGrossProfitJpy: number;
  appliedFeeRuleIds: string[];
  moneyTimeline: unknown[];
  moneyTimelineStatus: string;
  createdAt: string;
}

export interface BackofficeTechnicianPayload {
  id: number;
  userId: number;
  displayName: string;
  email: string;
  shopId: number | null;
  shopName: string | null;
  city: string;
  serviceArea: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface BackofficeShopPayload {
  id: number;
  ownerUserId: number | null;
  ownerEmail: string | null;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  isRecommended: boolean;
  createdAt: string;
}

export interface BackofficeDashboardPayload {
  metrics: BackofficeMetricPayload[];
  orders: BackofficeOrderPayload[];
  schedule: {
    total: number;
    available: number;
    booked: number;
  };
  finance: {
    estimatedServiceGmvJpy: number;
    platformNdpRevenue: number;
    requestFeeNdpRevenue: number;
    userRewardNdpCost: number;
    pendingHoldNdp: number;
    campaignDiscountNdp: number;
    unknownOrUnreportedServiceAmountJpy: number;
  };
  technicians: BackofficeTechnicianPayload[];
  shops: BackofficeShopPayload[];
}

export interface BackofficeCsvExportPayload {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  content: string;
}

export interface BackofficeRepositoryPort {
  getDashboard: (scope: BackofficeScope) => Promise<BackofficeDashboardPayload>;
  listOrders: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeOrderPayload>>;
  listSchedule: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeScheduleSlotPayload>>;
  listFinanceSettlements: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>>;
  exportFinanceSettlements: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<BackofficeCsvExportPayload>;
  listTechnicians: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeTechnicianPayload>>;
  listShops: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeShopPayload>>;
}

export class BackofficeService {
  public constructor(
    private readonly repository: BackofficeRepositoryPort,
    private readonly auditLogService: AuditLogService
  ) {}

  public async getPlatformDashboard(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeDashboardPayload> {
    await this.record(actor, context, "backoffice.dashboard.read", "backoffice_dashboard");

    return this.repository.getDashboard({ scope: "platform" });
  }

  public async getMerchantDashboard(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeDashboardPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.dashboard.read", "merchant_admin_dashboard", {
      shopId: scope.shopId
    });

    return this.repository.getDashboard(scope);
  }

  public async listPlatformOrders(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeOrderPayload>> {
    await this.record(actor, context, "backoffice.orders.list", "booking_order");

    return this.repository.listOrders({ scope: "platform", ...input });
  }

  public async listMerchantOrders(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeOrderPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.orders.list", "booking_order", {
      shopId: scope.shopId
    });

    return this.repository.listOrders({ ...scope, ...input });
  }

  public async listPlatformSchedule(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeScheduleSlotPayload>> {
    await this.record(actor, context, "backoffice.schedule.list", "schedule_slot");

    return this.repository.listSchedule({ scope: "platform", ...input });
  }

  public async listMerchantSchedule(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeScheduleSlotPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.schedule.list", "schedule_slot", {
      shopId: scope.shopId
    });

    return this.repository.listSchedule({ ...scope, ...input });
  }

  public async listPlatformFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>> {
    await this.record(actor, context, "backoffice.finance.list", "finance_reconciliation");

    return this.repository.listFinanceSettlements({ scope: "platform", ...input });
  }

  public async listMerchantFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeFinanceSettlementPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.finance.list", "finance_reconciliation", {
      shopId: scope.shopId
    });

    return this.repository.listFinanceSettlements({ ...scope, ...input });
  }

  public async exportPlatformFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<BackofficeCsvExportPayload> {
    await this.record(actor, context, "backoffice.finance.export", "finance_settlement_export");

    return this.repository.exportFinanceSettlements({ scope: "platform", ...input });
  }

  public async exportMerchantFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<BackofficeCsvExportPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(
      actor,
      context,
      "merchant_admin.finance.export",
      "finance_settlement_export",
      { shopId: scope.shopId }
    );

    return this.repository.exportFinanceSettlements({ ...scope, ...input });
  }

  public async listPlatformTechnicians(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeTechnicianPayload>> {
    await this.record(actor, context, "backoffice.technicians.list", "technician_profile");

    return this.repository.listTechnicians({ scope: "platform", ...input });
  }

  public async listMerchantTechnicians(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeTechnicianPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.technicians.list", "technician_profile", {
      shopId: scope.shopId
    });

    return this.repository.listTechnicians({ ...scope, ...input });
  }

  public async listPlatformShops(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeShopPayload>> {
    await this.record(actor, context, "backoffice.shops.list", "shop");

    return this.repository.listShops({ scope: "platform", ...input });
  }

  public async getMerchantShop(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PaginatedResponse<BackofficeShopPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.shop.read", "shop", {
      shopId: scope.shopId
    });

    return this.repository.listShops({ ...scope, page: 1, pageSize: 1 });
  }

  private getMerchantScope(
    actor: AuthenticatedAccessContext
  ): BackofficeScope & { scope: "merchant" } {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId) {
      return {
        scope: "merchant",
        shopId: actor.currentIdentityScopeId
      };
    }

    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetType: string,
    metadata?: unknown
  ): Promise<void> {
    return this.auditLogService.record({
      actor,
      action,
      targetType,
      context,
      metadata
    });
  }
}
