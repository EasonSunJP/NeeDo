import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { ParsedServiceIncomeReportBody } from "../validators/order-finance.validator";
import type { AuditLogService } from "./audit-log.service";
import type {
  CompensationPreviewPayload,
  CompensationRuleSet
} from "./compensation-engine.service";
import { CompensationEngine } from "./compensation-engine.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type ServiceIncomeStatus = "unreported" | "reported" | "confirmed";
export type ServicePaymentChannel =
  | "unknown"
  | "platform_online"
  | "offline_cash"
  | "offline_card"
  | "bank_transfer"
  | "other";

export interface MoneyTimelineEvent {
  type: string;
  label: string;
  amountJpy?: number;
  amountNdp?: number;
  actorType: "system" | "merchant" | "backoffice" | "customer" | "technician";
  occurredAt: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface OrderFinancialRecordPayload {
  id: number;
  serviceAmountJpy: number;
  platformCollectedServiceAmountJpy: number;
  offlineReportedServiceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy: number;
  paymentChannel: ServicePaymentChannel;
  serviceIncomeStatus: ServiceIncomeStatus;
  bPlatformFeeHoldNdp: number;
  bPlatformFeeActualNdp: number;
  userRewardNdp: number;
  campaignDiscountNdp: number;
  releasedNdp: number;
  penaltyNdp: number;
  compensationToUserNdp: number;
  appliedFeeRuleIds: string[];
  moneyTimeline: MoneyTimelineEvent[];
  serviceIncomeReportedById: number | null;
  serviceIncomeReportedAt: string | null;
  serviceIncomeConfirmedById: number | null;
  serviceIncomeConfirmedAt: string | null;
  serviceIncomeNote: string | null;
  serviceIncomeProofUrl: string | null;
  settlementStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFinanceRecord {
  bookingOrderId: number;
  orderNo: string;
  orderStatus: string;
  customerUserId: number;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  serviceName: string;
  priceAmountJpy: number;
  startsAt: string;
  endsAt: string;
  financial: OrderFinancialRecordPayload | null;
  activeCompensationRule: CompensationRuleSet | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceIncomeReportInput {
  bookingOrderId: number;
  serviceAmountJpy: number;
  platformCollectedServiceAmountJpy: number;
  offlineReportedServiceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy: number;
  paymentChannel: ServicePaymentChannel;
  serviceIncomeStatus: ServiceIncomeStatus;
  reportedById: number;
  confirmedById: number | null;
  note: string | null;
  proofUrl: string | null;
  moneyTimeline: MoneyTimelineEvent[];
}

export interface OrderFinanceRepositoryPort {
  findOrderFinance: (bookingOrderId: number) => Promise<OrderFinanceRecord | null>;
  upsertServiceIncomeReport: (input: ServiceIncomeReportInput) => Promise<OrderFinanceRecord>;
}

export interface OrderFinanceDetailPayload {
  bookingOrderId: number;
  orderNo: string;
  orderStatus: string;
  shopId: number;
  shopName: string;
  technicianProfileId: number | null;
  technicianName: string | null;
  serviceName: string;
  estimatedServiceGmvJpy: number;
  platformCollectedServiceAmountJpy: number;
  offlineReportedServiceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy: number;
  paymentChannel: ServicePaymentChannel;
  serviceIncomeStatus: ServiceIncomeStatus;
  serviceIncomeReportedById: number | null;
  serviceIncomeReportedAt: string | null;
  serviceIncomeConfirmedById: number | null;
  serviceIncomeConfirmedAt: string | null;
  serviceIncomeNote: string | null;
  serviceIncomeProofUrl: string | null;
  platformNdpRevenue: number;
  userRewardNdpCost: number;
  pendingHoldNdp: number;
  campaignDiscountNdp: number;
  releasedNdp: number;
  penaltyNdp: number;
  compensationToUserNdp: number;
  appliedFeeRuleIds: string[];
  moneyTimeline: MoneyTimelineEvent[];
  moneyTimelineStatus: string;
  technicianIncomePreview: CompensationPreviewPayload | null;
  createdAt: string;
  updatedAt: string;
}

type AuditRecorder = Pick<AuditLogService, "record">;

export class OrderFinanceService {
  public constructor(
    private readonly repository: OrderFinanceRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly compensationEngine = new CompensationEngine()
  ) {}

  public async getMerchantOrderFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number
  ): Promise<OrderFinanceDetailPayload> {
    const record = await this.getOrderFinanceRecord(bookingOrderId);
    this.assertMerchantShopScope(actor, record.shopId);
    await this.record(actor, context, "merchant_admin.finance_order.read", bookingOrderId, {
      shopId: record.shopId
    });

    return this.buildDetail(record);
  }

  public async getBackofficeOrderFinance(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number
  ): Promise<OrderFinanceDetailPayload> {
    const record = await this.getOrderFinanceRecord(bookingOrderId);
    await this.record(actor, context, "backoffice.finance_order.read", bookingOrderId, {
      shopId: record.shopId
    });

    return this.buildDetail(record);
  }

  public async reportMerchantServiceIncome(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number,
    input: ParsedServiceIncomeReportBody
  ): Promise<OrderFinanceDetailPayload> {
    const record = await this.getOrderFinanceRecord(bookingOrderId);
    this.assertMerchantShopScope(actor, record.shopId);
    const serviceAmountJpy = Math.round(input.serviceAmountJpy);
    const platformCollectedServiceAmountJpy = Math.round(input.platformCollectedServiceAmountJpy);
    const offlineReportedServiceAmountJpy = Math.round(input.offlineReportedServiceAmountJpy);
    const unknownOrUnreportedServiceAmountJpy = Math.max(
      0,
      serviceAmountJpy - platformCollectedServiceAmountJpy - offlineReportedServiceAmountJpy
    );
    const serviceIncomeStatus: ServiceIncomeStatus = input.confirmNow ? "confirmed" : "reported";
    const occurredAt = new Date().toISOString();
    const baseTimeline = this.sanitizeTimeline(record.financial?.moneyTimeline ?? []);
    const reportEvent: MoneyTimelineEvent = {
      type: "service_income_reported",
      label: "服务收入已上报",
      amountJpy: serviceAmountJpy,
      actorType: "merchant",
      occurredAt,
      status: serviceIncomeStatus,
      metadata: {
        paymentChannel: input.paymentChannel,
        platformCollectedServiceAmountJpy,
        offlineReportedServiceAmountJpy
      }
    };
    const moneyTimeline = [
      ...baseTimeline,
      reportEvent,
      ...(input.confirmNow
        ? [
            {
              type: "service_income_confirmed",
              label: "服务收入已确认",
              amountJpy: serviceAmountJpy,
              actorType: "merchant" as const,
              occurredAt,
              status: "confirmed",
              metadata: {
                paymentChannel: input.paymentChannel
              }
            }
          ]
        : [])
    ];
    const updated = await this.repository.upsertServiceIncomeReport({
      bookingOrderId,
      serviceAmountJpy,
      platformCollectedServiceAmountJpy,
      offlineReportedServiceAmountJpy,
      unknownOrUnreportedServiceAmountJpy,
      paymentChannel: input.paymentChannel,
      serviceIncomeStatus,
      reportedById: actor.userId,
      confirmedById: input.confirmNow ? actor.userId : null,
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
      moneyTimeline
    });
    await this.record(
      actor,
      context,
      "merchant_admin.finance_order.service_income_report",
      bookingOrderId,
      {
        shopId: record.shopId,
        serviceAmountJpy,
        platformCollectedServiceAmountJpy,
        offlineReportedServiceAmountJpy,
        paymentChannel: input.paymentChannel,
        serviceIncomeStatus
      }
    );

    return this.buildDetail(updated);
  }

  private async getOrderFinanceRecord(bookingOrderId: number): Promise<OrderFinanceRecord> {
    const record = await this.repository.findOrderFinance(bookingOrderId);

    if (!record) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.order_finance.not_found",
        statusCode: 404
      });
    }

    return record;
  }

  private buildDetail(record: OrderFinanceRecord): OrderFinanceDetailPayload {
    const financial = record.financial ?? this.defaultFinancial(record);
    const estimatedServiceGmvJpy = financial.serviceAmountJpy || record.priceAmountJpy;
    const platformNdpRevenue = financial.bPlatformFeeActualNdp - financial.userRewardNdp;
    const pendingHoldNdp = Math.max(
      0,
      financial.bPlatformFeeHoldNdp - financial.bPlatformFeeActualNdp - financial.releasedNdp
    );
    const technicianIncomePreview = record.activeCompensationRule
      ? this.compensationEngine.calculate(record.activeCompensationRule, {
          serviceAmountJpy: estimatedServiceGmvJpy,
          platformFeeNdp: financial.bPlatformFeeActualNdp || financial.bPlatformFeeHoldNdp || 500,
          workedMinutes: this.durationMinutes(record.startsAt, record.endsAt)
        })
      : null;
    const moneyTimeline = this.buildTimeline(record, financial, technicianIncomePreview);

    return {
      bookingOrderId: record.bookingOrderId,
      orderNo: record.orderNo,
      orderStatus: record.orderStatus.toLowerCase(),
      shopId: record.shopId,
      shopName: record.shopName,
      technicianProfileId: record.technicianProfileId,
      technicianName: record.technicianName,
      serviceName: record.serviceName,
      estimatedServiceGmvJpy,
      platformCollectedServiceAmountJpy: financial.platformCollectedServiceAmountJpy,
      offlineReportedServiceAmountJpy: financial.offlineReportedServiceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: financial.unknownOrUnreportedServiceAmountJpy,
      paymentChannel: financial.paymentChannel,
      serviceIncomeStatus: financial.serviceIncomeStatus,
      serviceIncomeReportedById: financial.serviceIncomeReportedById,
      serviceIncomeReportedAt: financial.serviceIncomeReportedAt,
      serviceIncomeConfirmedById: financial.serviceIncomeConfirmedById,
      serviceIncomeConfirmedAt: financial.serviceIncomeConfirmedAt,
      serviceIncomeNote: financial.serviceIncomeNote,
      serviceIncomeProofUrl: financial.serviceIncomeProofUrl,
      platformNdpRevenue,
      userRewardNdpCost: financial.userRewardNdp,
      pendingHoldNdp,
      campaignDiscountNdp: financial.campaignDiscountNdp,
      releasedNdp: financial.releasedNdp,
      penaltyNdp: financial.penaltyNdp,
      compensationToUserNdp: financial.compensationToUserNdp,
      appliedFeeRuleIds: financial.appliedFeeRuleIds,
      moneyTimeline,
      moneyTimelineStatus: this.moneyTimelineStatus(financial.serviceIncomeStatus),
      technicianIncomePreview,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  private buildTimeline(
    record: OrderFinanceRecord,
    financial: OrderFinancialRecordPayload,
    technicianIncomePreview: CompensationPreviewPayload | null
  ): MoneyTimelineEvent[] {
    const timeline: MoneyTimelineEvent[] = [
      {
        type: "order_created",
        label: "订单创建",
        amountJpy: record.priceAmountJpy,
        actorType: "customer",
        occurredAt: record.createdAt,
        status: record.orderStatus.toLowerCase()
      },
      ...this.sanitizeTimeline(financial.moneyTimeline)
    ];

    if (financial.bPlatformFeeHoldNdp > 0) {
      timeline.push({
        type: "platform_fee_hold",
        label: "平台费冻结",
        amountNdp: financial.bPlatformFeeHoldNdp,
        actorType: "system",
        occurredAt: financial.createdAt,
        status: financial.bPlatformFeeActualNdp > 0 ? "captured" : "held"
      });
    }

    if (financial.bPlatformFeeActualNdp > 0) {
      timeline.push({
        type: "platform_fee_captured",
        label: "平台费实扣",
        amountNdp: financial.bPlatformFeeActualNdp,
        actorType: "system",
        occurredAt: financial.updatedAt,
        status: "captured"
      });
    }

    if (financial.userRewardNdp > 0) {
      timeline.push({
        type: "user_reward_granted",
        label: "用户返点",
        amountNdp: financial.userRewardNdp,
        actorType: "system",
        occurredAt: financial.updatedAt,
        status: "granted"
      });
    }

    if (financial.serviceIncomeStatus === "unreported") {
      timeline.push({
        type: "service_income_unreported",
        label: "服务收入待上报",
        amountJpy: financial.unknownOrUnreportedServiceAmountJpy,
        actorType: "merchant",
        occurredAt: financial.updatedAt,
        status: "pending"
      });
    }

    if (technicianIncomePreview) {
      timeline.push({
        type: "technician_income_estimated",
        label: "技师收入预估",
        amountJpy: technicianIncomePreview.technicianNetIncomeJpy,
        actorType: "system",
        occurredAt: financial.updatedAt,
        status: "estimated",
        metadata: {
          shopEstimatedGrossProfitJpy: technicianIncomePreview.shopEstimatedGrossProfitJpy,
          compensationRuleExplanation: technicianIncomePreview.explanation
        }
      });
    }

    return timeline;
  }

  private defaultFinancial(record: OrderFinanceRecord): OrderFinancialRecordPayload {
    const timestamp = record.updatedAt;

    return {
      id: 0,
      serviceAmountJpy: record.priceAmountJpy,
      platformCollectedServiceAmountJpy: 0,
      offlineReportedServiceAmountJpy: 0,
      unknownOrUnreportedServiceAmountJpy: record.priceAmountJpy,
      paymentChannel: "unknown",
      serviceIncomeStatus: "unreported",
      bPlatformFeeHoldNdp: 0,
      bPlatformFeeActualNdp: 0,
      userRewardNdp: 0,
      campaignDiscountNdp: 0,
      releasedNdp: 0,
      penaltyNdp: 0,
      compensationToUserNdp: 0,
      appliedFeeRuleIds: [],
      moneyTimeline: [],
      serviceIncomeReportedById: null,
      serviceIncomeReportedAt: null,
      serviceIncomeConfirmedById: null,
      serviceIncomeConfirmedAt: null,
      serviceIncomeNote: null,
      serviceIncomeProofUrl: null,
      settlementStatus: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  private sanitizeTimeline(value: unknown): MoneyTimelineEvent[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is MoneyTimelineEvent => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const event = item as Partial<MoneyTimelineEvent>;

      return (
        typeof event.type === "string" &&
        typeof event.label === "string" &&
        typeof event.actorType === "string" &&
        typeof event.occurredAt === "string" &&
        typeof event.status === "string"
      );
    });
  }

  private durationMinutes(startsAt: string, endsAt: string): number {
    const start = Date.parse(startsAt);
    const end = Date.parse(endsAt);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 60;
    }

    return Math.round((end - start) / 60_000);
  }

  private moneyTimelineStatus(serviceIncomeStatus: ServiceIncomeStatus): string {
    if (serviceIncomeStatus === "confirmed") {
      return "complete";
    }
    if (serviceIncomeStatus === "reported") {
      return "needs_review";
    }

    return "needs_income_report";
  }

  private assertMerchantShopScope(actor: AuthenticatedAccessContext, shopId: number): void {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId === shopId) {
      return;
    }

    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private async record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetId: number,
    metadata?: unknown
  ): Promise<void> {
    await this.auditLogService.record({
      actor,
      action,
      targetType: "booking_order",
      targetId,
      context,
      metadata
    });
  }
}
