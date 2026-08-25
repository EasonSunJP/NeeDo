import { hash } from "bcryptjs";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  BackofficeCustomerUpdateBody,
  BackofficeListQuery,
  BackofficeServiceCreateBody,
  BackofficeServiceUpdateBody,
  BackofficeShopCreateBody,
  BackofficeShopUpdateBody,
  MerchantShopUpdateBody,
  BackofficeTechnicianApproveBody,
  BackofficeTechnicianUpdateBody,
  TechnicianRankingQuery
} from "../validators/backoffice.validator";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TechnicianRankingPeriod =
  | "today"
  | "last7days"
  | "last30days"
  | "month"
  | "custom"
  | "all";

export interface TechnicianRankingWindow {
  period: TechnicianRankingPeriod;
  timeZone: "Asia/Tokyo";
  fromDate: string | null;
  toDate: string | null;
  fromInclusive: Date | null;
  toExclusive: Date | null;
}

const formatCalendarDate = (year: number, month: number, day: number): string =>
  `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

const parseCalendarDate = (value: string): { year: number; month: number; day: number } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Invalid calendar date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }
  return { year, month, day };
};

const shiftCalendarDate = (value: string, days: number): string => {
  const { year, month, day } = parseCalendarDate(value);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return formatCalendarDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
};

const toTokyoCalendarDate = (value: Date): string => {
  const tokyo = new Date(value.getTime() + TOKYO_OFFSET_MS);
  return formatCalendarDate(
    tokyo.getUTCFullYear(),
    tokyo.getUTCMonth() + 1,
    tokyo.getUTCDate()
  );
};

const startOfTokyoCalendarDate = (value: string): Date => {
  const { year, month, day } = parseCalendarDate(value);
  return new Date(Date.UTC(year, month - 1, day) - TOKYO_OFFSET_MS);
};

export const resolveTechnicianRankingWindow = (
  input: { period?: TechnicianRankingPeriod; from?: string; to?: string },
  now = new Date()
): TechnicianRankingWindow => {
  const period = input.period ?? "month";
  if (period === "all") {
    return {
      period,
      timeZone: "Asia/Tokyo",
      fromDate: null,
      toDate: null,
      fromInclusive: null,
      toExclusive: null
    };
  }

  const today = toTokyoCalendarDate(now);
  let fromDate: string;
  let toDate: string;
  if (period === "custom") {
    if (!input.from || !input.to) {
      throw new Error("Custom period requires both from and to dates");
    }
    parseCalendarDate(input.from);
    parseCalendarDate(input.to);
    if (input.from > input.to) {
      throw new Error("Custom period start must not be after its end");
    }
    fromDate = input.from;
    toDate = input.to;
  } else if (period === "month") {
    fromDate = `${today.slice(0, 7)}-01`;
    toDate = shiftCalendarDate(
      `${shiftCalendarDate(fromDate, 32).slice(0, 7)}-01`,
      -1
    );
  } else {
    const trailingDays = period === "today" ? 1 : period === "last7days" ? 7 : 30;
    fromDate = shiftCalendarDate(today, -(trailingDays - 1));
    toDate = today;
  }

  return {
    period,
    timeZone: "Asia/Tokyo",
    fromDate,
    toDate,
    fromInclusive: startOfTokyoCalendarDate(fromDate),
    toExclusive: startOfTokyoCalendarDate(shiftCalendarDate(toDate, 1))
  };
};

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
  paymentStatus: "pending" | "confirmed" | "refundPending" | "refunded";
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

export interface BackofficeTechnicianRankingRowPayload {
  rank: number;
  technicianProfileId: number;
  userId: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  shopId: number | null;
  shopName: string | null;
  city: string;
  serviceArea: string | null;
  status: string;
  verifiedAt: string | null;
  completedServiceAmountJpy: number;
  completedOrderCount: number;
  workingDayCount: number;
}

export interface BackofficeTechnicianRankingSummaryPayload {
  technicianCount: number;
  completedServiceAmountJpy: number;
  completedOrderCount: number;
  workingDayCount: number;
}

export interface BackofficeTechnicianRankingPayload
  extends PaginatedResponse<BackofficeTechnicianRankingRowPayload> {
  summary: BackofficeTechnicianRankingSummaryPayload;
}

export interface BackofficeTechnicianRankingResponsePayload
  extends BackofficeTechnicianRankingPayload {
  period: {
    key: TechnicianRankingPeriod;
    timeZone: "Asia/Tokyo";
    from: string | null;
    to: string | null;
  };
}

export type TechnicianRankingRepositoryInput = BackofficeScope &
  TechnicianRankingQuery & {
    window: TechnicianRankingWindow;
  };

export interface BackofficeShopPayload {
  id: number;
  ownerUserId: number | null;
  ownerEmail: string | null;
  name: string;
  description: string | null;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  isRecommended: boolean;
  createdAt: string;
}

export interface BackofficeCustomerPayload {
  id: number;
  userId: number;
  displayName: string;
  email: string;
  city: string | null;
  membershipLevel: string;
  isPublic: boolean;
  bookingCount: number;
  createdAt: string;
}

export interface BackofficeRolePayload {
  name: string;
  code: string;
  scopeType: string | null;
  scopeId: number | null;
}

export interface BackofficeIdentityPayload {
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  displayName: string | null;
}

export interface BackofficeAccountPayload {
  username: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: BackofficeRolePayload[];
  identities: BackofficeIdentityPayload[];
}

export interface BackofficeReviewSummaryPayload {
  ratingAverage: number;
  reviewCount: number;
  latestReviewAt: string | null;
  highlights: string[];
}

export interface BackofficeTechnicianServiceDetailPayload {
  id: number;
  source: "technician_service" | "service";
  sourceShopServiceId: number | null;
  name: string;
  description: string | null;
  categoryId: number;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  isRecommended: boolean;
}

export interface BackofficeCompensationProfilePayload {
  id: number;
  shopId: number;
  technicianProfileId: number;
  name: string;
  status: string;
  version: number;
  wageMode: string;
  baseSalaryJpy: number;
  hourlyRateJpy: number;
  dailyRateJpy: number;
  fixedOrderPayJpy: number;
  commissionRatePercent: number;
  guaranteedMinimumJpy: number;
  ndpFeeBearer: string;
  technicianNdpSharePercent: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  updatedAt: string;
}

export interface BackofficeAuditEventPayload {
  id: string;
  action: string;
  actorName: string;
  actorAvatarUrl: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface BackofficeTechnicianDetailPayload extends BackofficeTechnicianPayload {
  bio: string | null;
  yearsExperience: number;
  isRecommended: boolean;
  updatedAt: string;
  account: BackofficeAccountPayload;
  statistics: {
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    completedRevenueJpy: number;
    todayScheduleMinutes: number;
    weekScheduleMinutes: number;
    monthScheduleMinutes: number;
  };
  reviewSummary: BackofficeReviewSummaryPayload | null;
  services: BackofficeTechnicianServiceDetailPayload[];
  servicesLimit: number;
  servicesTruncated: boolean;
  upcomingSchedule: BackofficeScheduleSlotPayload[];
  compensationProfile: BackofficeCompensationProfilePayload | null;
  timeline: BackofficeAuditEventPayload[];
  unavailableMetrics: Array<"acceptanceRate" | "lateness" | "shiftPreferences">;
}

export interface BackofficeCustomerDetailPayload extends BackofficeCustomerPayload {
  bio: string | null;
  updatedAt: string;
  account: BackofficeAccountPayload;
  bookingStatusTotals: Record<string, number>;
  completedSpendJpy: number;
  nextBooking: BackofficeOrderPayload | null;
  recentBookings: BackofficeOrderPayload[];
  reviewSummary: BackofficeReviewSummaryPayload | null;
  timeline: BackofficeAuditEventPayload[];
}

export interface BackofficeServicePayload {
  id: number;
  categoryId: number;
  categoryName: string;
  shopId: number;
  technicianProfileId: number | null;
  name: string;
  description: string | null;
  city: string;
  serviceMode: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  status: string;
  isRecommended: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackofficeShopCreateData extends Omit<BackofficeShopCreateBody, "ownerPassword"> {
  ownerPasswordHash: string;
}

export type ScopedTechnicianUpdateInput = BackofficeScope &
  BackofficeTechnicianUpdateBody & { technicianId: number };
export type ScopedTechnicianApprovalInput = BackofficeScope &
  BackofficeTechnicianApproveBody & { technicianId: number; approvedAt: Date };
export type ScopedEntityInput = BackofficeScope & { id: number };
export type ScopedServiceCreateInput = BackofficeScope & BackofficeServiceCreateBody & { shopId: number };
export type ScopedServiceUpdateInput = BackofficeScope &
  BackofficeServiceUpdateBody & { serviceId: number };

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
  listTechnicianRankings: (
    input: TechnicianRankingRepositoryInput
  ) => Promise<BackofficeTechnicianRankingPayload>;
  listShops: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeShopPayload>>;
  findUserByEmail: (email: string) => Promise<{ id: number } | null>;
  createShop: (input: BackofficeShopCreateData) => Promise<BackofficeShopPayload>;
  updateShop: (id: number, input: BackofficeShopUpdateBody) => Promise<BackofficeShopPayload | null>;
  approveShop: (id: number, approvedAt: Date) => Promise<BackofficeShopPayload | null>;
  softDeleteShop: (id: number) => Promise<BackofficeShopPayload | null>;
  updateTechnician: (input: ScopedTechnicianUpdateInput) => Promise<BackofficeTechnicianPayload | null>;
  approveTechnician: (input: ScopedTechnicianApprovalInput) => Promise<BackofficeTechnicianPayload | null>;
  softDeleteTechnician: (input: ScopedEntityInput) => Promise<BackofficeTechnicianPayload | null>;
  listCustomers: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeCustomerPayload>>;
  getCustomer: (input: ScopedEntityInput) => Promise<BackofficeCustomerPayload | null>;
  getTechnicianDetail: (input: ScopedEntityInput) => Promise<BackofficeTechnicianDetailPayload | null>;
  getCustomerDetail: (input: ScopedEntityInput) => Promise<BackofficeCustomerDetailPayload | null>;
  updateCustomer: (id: number, input: BackofficeCustomerUpdateBody) => Promise<BackofficeCustomerPayload | null>;
  softDeleteCustomer: (id: number) => Promise<BackofficeCustomerPayload | null>;
  listServices: (
    input: BackofficeScope & BackofficeListQuery
  ) => Promise<PaginatedResponse<BackofficeServicePayload>>;
  createService: (input: ScopedServiceCreateInput) => Promise<BackofficeServicePayload>;
  updateService: (input: ScopedServiceUpdateInput) => Promise<BackofficeServicePayload | null>;
  softDeleteService: (input: ScopedEntityInput) => Promise<BackofficeServicePayload | null>;
}

export class BackofficeService {
  private static readonly BCRYPT_ROUNDS = 12;

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

  public async listPlatformTechnicianRankings(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: TechnicianRankingQuery
  ): Promise<BackofficeTechnicianRankingResponsePayload> {
    const window = resolveTechnicianRankingWindow(input);
    await this.record(actor, context, "backoffice.technician_rankings.list", "technician_ranking", {
      period: window.period,
      from: window.fromDate,
      to: window.toDate,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder
    });
    const ranking = await this.repository.listTechnicianRankings({
      scope: "platform",
      ...input,
      window
    });

    return {
      ...ranking,
      period: {
        key: window.period,
        timeZone: window.timeZone,
        from: window.fromDate,
        to: window.toDate
      }
    };
  }

  public async exportPlatformTechnicianRankings(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: TechnicianRankingQuery
  ): Promise<BackofficeCsvExportPayload> {
    const window = resolveTechnicianRankingWindow(input);
    await this.record(
      actor,
      context,
      "backoffice.technician_rankings.export",
      "technician_ranking_export",
      {
        period: window.period,
        from: window.fromDate,
        to: window.toDate,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder
      }
    );

    const rows: BackofficeTechnicianRankingRowPayload[] = [];
    const pageSize = 100;
    const exportLimit = 5000;
    let page = 1;
    let total = 0;
    do {
      const result = await this.repository.listTechnicianRankings({
        scope: "platform",
        ...input,
        page,
        pageSize,
        window
      });
      rows.push(...result.list);
      total = result.total;
      page += 1;
    } while (rows.length < total && rows.length < exportLimit);

    const csvRows = [
      [
        "rank",
        "technicianProfileId",
        "displayName",
        "email",
        "shopName",
        "city",
        "completedServiceAmountJpy",
        "completedOrderCount",
        "workingDayCount"
      ],
      ...rows.slice(0, exportLimit).map((row) => [
        row.rank,
        row.technicianProfileId,
        row.displayName,
        row.email,
        row.shopName ?? "",
        row.city,
        row.completedServiceAmountJpy,
        row.completedOrderCount,
        row.workingDayCount
      ])
    ];
    const content = `\uFEFF${csvRows
      .map((row) => row.map((value) => this.escapeCsvCell(value)).join(","))
      .join("\n")}`;
    const range = window.fromDate && window.toDate ? `${window.fromDate}_${window.toDate}` : "all";

    return {
      filename: `technician-rankings-${window.period}-${range}.csv`,
      contentType: "text/csv; charset=utf-8",
      content
    };
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

  public async getPlatformTechnician(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianDetailPayload> {
    await this.record(actor, context, "backoffice.technician.read", "TechnicianProfile", {
      technicianProfileId: id
    });
    return this.requireResult(
      await this.repository.getTechnicianDetail({ scope: "platform", id }),
      "error.technician.not_found"
    );
  }

  public async getMerchantTechnician(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianDetailPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.technician.read", "TechnicianProfile", {
      technicianProfileId: id,
      shopId: scope.shopId
    });
    return this.requireResult(
      await this.repository.getTechnicianDetail({ ...scope, id }),
      "error.technician.not_found"
    );
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

  public async createPlatformShop(
    input: BackofficeShopCreateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    if (await this.repository.findUserByEmail(input.ownerEmail)) {
      throw this.emailExistsError();
    }

    let shop: BackofficeShopPayload;
    try {
      shop = await this.repository.createShop({
        ...input,
        ownerPasswordHash: await hash(input.ownerPassword, BackofficeService.BCRYPT_ROUNDS)
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw this.emailExistsError();
      }
      throw error;
    }
    await this.record(actor, context, "backoffice.shop.create", "Shop", {
      shopId: shop.id,
      ownerUserId: shop.ownerUserId
    });

    return shop;
  }

  public async updatePlatformShop(
    id: number,
    input: BackofficeShopUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const shop = this.requireResult(await this.repository.updateShop(id, input), "error.shop.not_found");
    await this.record(actor, context, "backoffice.shop.update", "Shop", {
      shopId: id,
      changedFields: Object.keys(input)
    });
    return shop;
  }

  public async updateMerchantShop(
    input: MerchantShopUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const scope = this.getMerchantScope(actor);
    const shop = this.requireResult(
      await this.repository.updateShop(scope.shopId, input),
      "error.shop.not_found"
    );
    await this.record(actor, context, "merchant_admin.shop.update", "Shop", {
      shopId: scope.shopId,
      changedFields: Object.keys(input)
    });
    return shop;
  }

  public async approvePlatformShop(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const shop = this.requireResult(await this.repository.approveShop(id, new Date()), "error.shop.not_found");
    await this.record(actor, context, "backoffice.shop.approve", "Shop", { shopId: id });
    return shop;
  }

  public async deletePlatformShop(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeShopPayload> {
    const shop = this.requireResult(await this.repository.softDeleteShop(id), "error.shop.not_found");
    await this.record(actor, context, "backoffice.shop.delete", "Shop", { shopId: id });
    return shop;
  }

  public async updatePlatformTechnician(
    technicianId: number,
    input: BackofficeTechnicianUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const technician = this.requireResult(
      await this.repository.updateTechnician({ scope: "platform", technicianId, ...input }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "backoffice.technician.update", "TechnicianProfile", {
      technicianId,
      changedFields: Object.keys(input)
    });
    return technician;
  }

  public async updateMerchantTechnician(
    technicianId: number,
    input: BackofficeTechnicianUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const scope = this.getMerchantScope(actor);
    const safeInput: Omit<BackofficeTechnicianUpdateBody, "shopId"> = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.serviceArea !== undefined ? { serviceArea: input.serviceArea } : {}),
      ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {})
    };
    const technician = this.requireResult(
      await this.repository.updateTechnician({ ...scope, technicianId, ...safeInput }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "merchant_admin.technician.update", "TechnicianProfile", {
      technicianId,
      shopId: scope.shopId,
      changedFields: Object.keys(safeInput)
    });
    return technician;
  }

  public async approvePlatformTechnician(
    technicianId: number,
    input: BackofficeTechnicianApproveBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const technician = this.requireResult(
      await this.repository.approveTechnician({
        scope: "platform",
        technicianId,
        shopId: input.shopId,
        approvedAt: new Date()
      }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "backoffice.technician.approve", "TechnicianProfile", {
      technicianId,
      shopId: technician.shopId
    });
    return technician;
  }

  public async approveMerchantTechnician(
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    const scope = this.getMerchantScope(actor);
    const technician = this.requireResult(
      await this.repository.approveTechnician({ ...scope, technicianId, approvedAt: new Date() }),
      "error.technician.not_found"
    );
    await this.record(actor, context, "merchant_admin.technician.approve", "TechnicianProfile", {
      technicianId,
      shopId: scope.shopId
    });
    return technician;
  }

  public async deletePlatformTechnician(
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    return this.deleteTechnician({ scope: "platform" }, technicianId, actor, context, "backoffice.technician.delete");
  }

  public async deleteMerchantTechnician(
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeTechnicianPayload> {
    return this.deleteTechnician(this.getMerchantScope(actor), technicianId, actor, context, "merchant_admin.technician.delete");
  }

  public async listPlatformCustomers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeCustomerPayload>> {
    await this.record(actor, context, "backoffice.customers.list", "CustomerProfile");
    return this.repository.listCustomers({ scope: "platform", ...input });
  }

  public async listMerchantCustomers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeCustomerPayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.customers.list", "CustomerProfile", { shopId: scope.shopId });
    return this.repository.listCustomers({ ...scope, ...input });
  }

  public async getPlatformCustomer(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerDetailPayload> {
    await this.record(actor, context, "backoffice.customer.read", "CustomerProfile", { customerProfileId: id });
    return this.requireResult(await this.repository.getCustomerDetail({ scope: "platform", id }), "error.customer.not_found");
  }

  public async getMerchantCustomer(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerDetailPayload> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.customer.read", "CustomerProfile", { customerProfileId: id, shopId: scope.shopId });
    return this.requireResult(await this.repository.getCustomerDetail({ ...scope, id }), "error.customer.not_found");
  }

  public async updatePlatformCustomer(
    id: number,
    input: BackofficeCustomerUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerPayload> {
    const customer = this.requireResult(await this.repository.updateCustomer(id, input), "error.customer.not_found");
    await this.record(actor, context, "backoffice.customer.update", "CustomerProfile", { customerProfileId: id, changedFields: Object.keys(input) });
    return customer;
  }

  public async deletePlatformCustomer(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeCustomerPayload> {
    const customer = this.requireResult(await this.repository.softDeleteCustomer(id), "error.customer.not_found");
    await this.record(actor, context, "backoffice.customer.delete", "CustomerProfile", { customerProfileId: id });
    return customer;
  }

  public async listPlatformServices(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeServicePayload>> {
    await this.record(actor, context, "backoffice.services.list", "Service");
    return this.repository.listServices({ scope: "platform", ...input });
  }

  public async listMerchantServices(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: BackofficeListQuery
  ): Promise<PaginatedResponse<BackofficeServicePayload>> {
    const scope = this.getMerchantScope(actor);
    await this.record(actor, context, "merchant_admin.services.list", "Service", { shopId: scope.shopId });
    return this.repository.listServices({ ...scope, ...input });
  }

  public async createPlatformService(
    shopId: number,
    input: BackofficeServiceCreateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.createService({ scope: "platform", shopId, ...input }, actor, context, "backoffice.service.create");
  }

  public async createMerchantService(
    input: BackofficeServiceCreateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    const scope = this.getMerchantScope(actor);
    return this.createService({ ...scope, ...input }, actor, context, "merchant_admin.service.create");
  }

  public async updatePlatformService(
    serviceId: number,
    input: BackofficeServiceUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.updateService({ scope: "platform", serviceId, ...input }, actor, context, "backoffice.service.update");
  }

  public async updateMerchantService(
    serviceId: number,
    input: BackofficeServiceUpdateBody,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    const scope = this.getMerchantScope(actor);
    return this.updateService({ ...scope, serviceId, ...input }, actor, context, "merchant_admin.service.update");
  }

  public async deletePlatformService(
    serviceId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.deleteService({ scope: "platform" }, serviceId, actor, context, "backoffice.service.delete");
  }

  public async deleteMerchantService(
    serviceId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<BackofficeServicePayload> {
    return this.deleteService(this.getMerchantScope(actor), serviceId, actor, context, "merchant_admin.service.delete");
  }

  private async deleteTechnician(
    scope: BackofficeScope,
    technicianId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeTechnicianPayload> {
    const technician = this.requireResult(await this.repository.softDeleteTechnician({ ...scope, id: technicianId }), "error.technician.not_found");
    await this.record(actor, context, action, "TechnicianProfile", { technicianId, ...(scope.scope === "merchant" ? { shopId: scope.shopId } : {}) });
    return technician;
  }

  private async createService(
    input: ScopedServiceCreateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeServicePayload> {
    const service = await this.repository.createService(input);
    await this.record(actor, context, action, "Service", { serviceId: service.id, shopId: service.shopId });
    return service;
  }

  private async updateService(
    input: ScopedServiceUpdateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeServicePayload> {
    const service = this.requireResult(await this.repository.updateService(input), "error.service.not_found");
    await this.record(actor, context, action, "Service", { serviceId: input.serviceId, shopId: service.shopId, changedFields: Object.keys(input).filter((key) => !["scope", "shopId", "serviceId"].includes(key)) });
    return service;
  }

  private async deleteService(
    scope: BackofficeScope,
    serviceId: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string
  ): Promise<BackofficeServicePayload> {
    const service = this.requireResult(await this.repository.softDeleteService({ ...scope, id: serviceId }), "error.service.not_found");
    await this.record(actor, context, action, "Service", { serviceId, shopId: service.shopId });
    return service;
  }

  private requireResult<T>(value: T | null, message: string): T {
    if (!value) {
      throw new AppError({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
    }
    return value;
  }

  private emailExistsError(): AppError {
    return new AppError({ code: ERROR_CODES.EMAIL_ALREADY_EXISTS, message: "error.user.email_exists", statusCode: 409 });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
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

  private escapeCsvCell(value: number | string): string {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }
}
