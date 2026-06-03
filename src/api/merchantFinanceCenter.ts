import { httpClient } from "./httpClient";
import type {
  AppliedShopFinanceAdjustment,
  ShopFinanceBonusRulePayload,
  ShopFinanceDeductionRulePayload,
  ShopFinanceNdpBearer,
  ShopFinanceWageMode
} from "./merchantFinanceRules";

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

export interface CompensationPreviewPayload {
  serviceAmountJpy: number;
  platformFeeNdp: number;
  basePayJpy: number;
  commissionPayJpy: number;
  minimumGuaranteeAdjustmentJpy: number;
  bonusPayJpy: number;
  deductionJpy: number;
  technicianGrossIncomeJpy: number;
  technicianNdpShareNdp: number;
  shopNdpShareNdp: number;
  technicianNetIncomeJpy: number;
  shopEstimatedGrossProfitJpy: number;
  appliedBonusRules: AppliedShopFinanceAdjustment[];
  appliedDeductionRules: AppliedShopFinanceAdjustment[];
  explanation: string[];
}

export interface TechnicianCompensationProfilePayload {
  id: number;
  sourceType: "shop_default" | "technician_override";
  shopId: number;
  technicianProfileId: number | null;
  name: string;
  status: "active" | "archived";
  version: number;
  wageMode: ShopFinanceWageMode;
  baseSalaryJpy: number;
  hourlyRateJpy: number;
  dailyRateJpy: number;
  fixedOrderPayJpy: number;
  commissionRatePercent: number;
  guaranteedMinimumJpy: number;
  ndpFeeBearer: ShopFinanceNdpBearer;
  technicianNdpSharePercent: number;
  bonusRules: ShopFinanceBonusRulePayload[];
  deductionRules: ShopFinanceDeductionRulePayload[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianCompensationProfileInput {
  name: string;
  wageMode: ShopFinanceWageMode;
  baseSalaryJpy?: number;
  hourlyRateJpy?: number;
  dailyRateJpy?: number;
  fixedOrderPayJpy?: number;
  commissionRatePercent?: number;
  guaranteedMinimumJpy?: number;
  ndpFeeBearer?: ShopFinanceNdpBearer;
  technicianNdpSharePercent?: number;
  bonusRules?: ShopFinanceBonusRulePayload[];
  deductionRules?: ShopFinanceDeductionRulePayload[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface CompensationProfilePreviewInput {
  serviceAmountJpy: number;
  platformFeeNdp?: number;
  workedMinutes?: number;
  monthlyCompletedOrders?: number;
  monthlyServiceGmvJpy?: number;
  ratingAverage?: number;
  lateCancellationCount?: number;
}

export interface CompensationProfilePreviewResult {
  shopId: number;
  technicianProfileId: number;
  profile: TechnicianCompensationProfilePayload;
  preview: CompensationPreviewPayload;
}

export interface ServiceIncomeReportInput {
  serviceAmountJpy: number;
  platformCollectedServiceAmountJpy?: number;
  offlineReportedServiceAmountJpy?: number;
  paymentChannel?: ServicePaymentChannel;
  confirmNow?: boolean;
  note?: string | null;
  proofUrl?: string | null;
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

const compensationPath = (shopId: number, technicianProfileId: number) =>
  `/merchant-admin/shops/${shopId}/technicians/${technicianProfileId}/compensation-profile`;

export const merchantFinanceCenterApi = {
  getOrderFinance(bookingOrderId: number) {
    return httpClient.request<OrderFinanceDetailPayload>(
      `/merchant-admin/finance/orders/${bookingOrderId}`
    );
  },
  getBackofficeOrderFinance(bookingOrderId: number) {
    return httpClient.request<OrderFinanceDetailPayload>(
      `/backoffice/finance/orders/${bookingOrderId}`
    );
  },
  reportServiceIncome(bookingOrderId: number, body: ServiceIncomeReportInput) {
    return httpClient.request<OrderFinanceDetailPayload>(
      `/merchant-admin/finance/orders/${bookingOrderId}/service-income-report`,
      {
        body,
        method: "PUT"
      }
    );
  },
  getCompensationProfile(shopId: number, technicianProfileId: number) {
    return httpClient.request<TechnicianCompensationProfilePayload>(
      compensationPath(shopId, technicianProfileId)
    );
  },
  updateCompensationProfile(
    shopId: number,
    technicianProfileId: number,
    body: TechnicianCompensationProfileInput
  ) {
    return httpClient.request<TechnicianCompensationProfilePayload>(
      compensationPath(shopId, technicianProfileId),
      {
        body,
        method: "PUT"
      }
    );
  },
  previewCompensationProfile(
    shopId: number,
    technicianProfileId: number,
    body: CompensationProfilePreviewInput
  ) {
    return httpClient.request<CompensationProfilePreviewResult>(
      `${compensationPath(shopId, technicianProfileId)}/preview`,
      {
        body,
        method: "POST"
      }
    );
  }
};
