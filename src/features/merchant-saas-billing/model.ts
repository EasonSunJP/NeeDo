import type { Language } from "../../i18n/translations";

export type BillingSubjectType = "merchant_account" | "shop";
export type BillingCadence = "monthly" | "annual" | "free";
export type BillingState = "trial" | "paid" | "free" | "overdue";
export type TrialStatus = "not_started" | "active" | "completed" | "interrupted" | "not_applicable";
export type PaymentProviderType = "manual" | "stripe";
export type PaymentResponsibility = "group_consolidated" | "shops_individual";
export type SuspensionScope = "subject_only" | "merchant_and_shops" | "merchant_detach_shops";
export type SuspensionReasonCode =
  | "overdue_payment"
  | "qualification_or_fraud"
  | "serious_service_violation"
  | "customer_complaints"
  | "safety_risk"
  | "account_abuse"
  | "merchant_requested_closure"
  | "other";

export interface FreeDuration {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

export interface BillingProfileCard {
  subjectType: BillingSubjectType;
  subjectId: number;
  cadence: BillingCadence;
  monthlyFeeJpy: number;
  annualFeeJpy: number;
  cadenceLocked: boolean;
  amountLocked: boolean;
  state: BillingState;
  trialStatus: TrialStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  paidThrough: string | null;
  paymentProvider: PaymentProviderType;
  freeDuration: FreeDuration | null;
  extensionCount: number;
  version: number;
}

export interface ActiveSuspension {
  id: number;
  scope: SuspensionScope;
  reasonCodes: SuspensionReasonCode[];
  startsAt: string;
}

export interface ShopCreator {
  userId: number;
  needoId: string;
  displayName: string;
  email: string;
}

export interface ShopCard {
  id: number;
  type: "single_shop" | "shop";
  name: string;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  ownerEmail: string | null;
  createdBy: ShopCreator | null;
  platformCommissionRatePercent: number;
  coverUrl: string | null;
  ratingAverage: number;
  reviewCount: number;
  technicianCount: number;
  billing: BillingProfileCard;
  suspension: ActiveSuspension | null;
  createdAt: string;
}

export interface MerchantGroupCard {
  id: number;
  type: "merchant_group";
  code: string;
  name: string;
  status: string;
  paymentResponsibility: PaymentResponsibility;
  billing: BillingProfileCard;
  suspension: ActiveSuspension | null;
  consolidatedMonthlyTotalJpy: number;
  shops: ShopCard[];
  createdAt: string;
}

export type MerchantAccountCard = MerchantGroupCard | ShopCard;

const billingStateLabels: Record<Language, Record<BillingState, string>> = {
  zh: { trial: "试用", paid: "付费", free: "免费", overdue: "欠费" },
  "zh-Hant": { trial: "試用", paid: "付費", free: "免費", overdue: "欠費" },
  ja: { trial: "無料体験", paid: "支払済み", free: "無料", overdue: "未払い" },
  en: { trial: "Trial", paid: "Paid", free: "Free", overdue: "Overdue" },
  ko: { trial: "체험", paid: "결제 완료", free: "무료", overdue: "미납" }
};

export function formatBillingState(state: BillingState, language: Language) {
  return billingStateLabels[language][state];
}

export function formatFreeDuration(duration: FreeDuration | null, language: Language) {
  if (!duration) {
    return {
      zh: "不适用",
      "zh-Hant": "不適用",
      ja: "対象外",
      en: "Not applicable",
      ko: "해당 없음"
    }[language];
  }

  if (language === "en") {
    return `${duration.years}y ${duration.months}m ${duration.days}d`;
  }

  if (language === "ko") {
    return `${duration.years}년 ${duration.months}개월 ${duration.days}일`;
  }

  return `${duration.years}年${duration.months}月${duration.days}日`;
}

export function isAccountOverdue(billing: Pick<BillingProfileCard, "state">) {
  return billing.state === "overdue";
}

export function calculateGroupMonthlyTotal(
  group: Pick<MerchantGroupCard, "billing" | "shops">
) {
  const groupFee = group.billing.cadence === "free" ? 0 : group.billing.monthlyFeeJpy;
  return group.shops.reduce((total, shop) => {
    if (shop.type === "single_shop" || shop.billing.cadence === "free") {
      return total;
    }
    return total + shop.billing.monthlyFeeJpy;
  }, groupFee);
}

export function formatJpy(amount: number, language: Language) {
  const locale = {
    zh: "zh-CN",
    "zh-Hant": "zh-Hant",
    ja: "ja-JP",
    en: "en-US",
    ko: "ko-KR"
  }[language];
  return new Intl.NumberFormat(locale, {
    currency: "JPY",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(amount);
}

export function isMerchantGroup(card: MerchantAccountCard): card is MerchantGroupCard {
  return card.type === "merchant_group";
}
