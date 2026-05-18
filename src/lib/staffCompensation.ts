import type { Technician } from "../types/domain";

export type StaffCompensationSource = Pick<Technician, "id" | "orderCount" | "rating">;

export type StaffCompensationRule = {
  salaryMonthly: number;
  commissionRate: number;
  nominationFeeRate: number;
  bonusAmount: number;
  bonusCondition: string;
  bonusMinimumCompletedOrders: number;
  bonusMinimumRating: number;
  insuranceLabel: string;
  penaltyUnitAmount: number;
  penaltyCondition: string;
  transportAllowancePerVisit: number;
  settlementBasis: string;
};

export type StaffCompensationCalculationInput = {
  salesAmount: number;
  nominatedSalesAmount?: number;
  completedOrders?: number;
  visitCount?: number;
  penaltyCount?: number;
  rating?: number;
  bonusEligible?: boolean;
};

export type StaffCompensationCalculationResult = {
  salaryAmount: number;
  commissionAmount: number;
  nominationFeeAmount: number;
  bonusAmount: number;
  transportAllowanceAmount: number;
  penaltyAmount: number;
  totalAmount: number;
};

function clampMoney(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function getStableCompensationIndex(staffId: string) {
  return staffId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function buildStaffCompensationRule(
  source: StaffCompensationSource,
  options: {
    settlementBasis?: string;
    stableIndex?: number;
  } = {}
): StaffCompensationRule {
  const stableIndex = options.stableIndex ?? getStableCompensationIndex(source.id);
  const bonusMinimumCompletedOrders = source.orderCount >= 900 ? 80 : 60;
  const bonusMinimumRating = source.rating >= 4.9 ? 4.9 : 4.8;

  return {
    salaryMonthly: 220000 + (stableIndex % 8) * 12000,
    commissionRate: 28 + (stableIndex % 12),
    nominationFeeRate: 4 + (stableIndex % 4),
    bonusAmount: source.rating >= 4.9 ? 30000 + (stableIndex % 4) * 5000 : 15000 + (stableIndex % 3) * 3000,
    bonusCondition: `评分 ${bonusMinimumRating.toFixed(2)} 以上，本月完单 ${bonusMinimumCompletedOrders} 单以上`,
    bonusMinimumCompletedOrders,
    bonusMinimumRating,
    insuranceLabel: stableIndex % 3 === 0 ? "门店统一加入" : "平台基础保障",
    penaltyUnitAmount: 1500,
    penaltyCondition: "迟到 / 取消记录按件进入试算",
    transportAllowancePerVisit: 800 + (stableIndex % 5) * 200,
    settlementBasis: options.settlementBasis ?? "平台财务导出"
  };
}

export function calculateStaffCompensation(
  rule: StaffCompensationRule,
  input: StaffCompensationCalculationInput
): StaffCompensationCalculationResult {
  const salesAmount = clampMoney(input.salesAmount);
  const nominatedSalesAmount = clampMoney(input.nominatedSalesAmount ?? 0);
  const completedOrders = Math.max(0, Math.round(input.completedOrders ?? 0));
  const visitCount = Math.max(0, Math.round(input.visitCount ?? 0));
  const penaltyCount = Math.max(0, Math.round(input.penaltyCount ?? 0));
  const rating = typeof input.rating === "number" ? input.rating : 0;
  const bonusEligible = input.bonusEligible ?? (rating >= rule.bonusMinimumRating && completedOrders >= rule.bonusMinimumCompletedOrders);
  const salaryAmount = clampMoney(rule.salaryMonthly);
  const commissionAmount = Math.round(salesAmount * (rule.commissionRate / 100));
  const nominationFeeAmount = Math.round(nominatedSalesAmount * (rule.nominationFeeRate / 100));
  const bonusAmount = bonusEligible ? clampMoney(rule.bonusAmount) : 0;
  const transportAllowanceAmount = visitCount * clampMoney(rule.transportAllowancePerVisit);
  const penaltyAmount = penaltyCount * clampMoney(rule.penaltyUnitAmount);

  return {
    salaryAmount,
    commissionAmount,
    nominationFeeAmount,
    bonusAmount,
    transportAllowanceAmount,
    penaltyAmount,
    totalAmount: salaryAmount + commissionAmount + nominationFeeAmount + bonusAmount + transportAllowanceAmount - penaltyAmount
  };
}
