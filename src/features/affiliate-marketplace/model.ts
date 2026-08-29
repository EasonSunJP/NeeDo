import type {
  AffiliateContentLocale,
  AffiliateDiscountType,
  AffiliateMarketplaceTask
} from "../../api/affiliateMarketplace";
import type { Language } from "../../i18n/translations";

export type AffiliateTaskTag =
  | { kind: "customer-limit"; count: number }
  | { kind: "service"; label: string }
  | { kind: "minimum-order"; amountJpy: number }
  | { kind: "discount"; discountType: AffiliateDiscountType; value: number }
  | { kind: "high-reward"; rewardNdp: number };

export type AffiliateDiscountPresentation =
  | { kind: "none" }
  | { kind: "fixed_jpy"; amountJpy: number }
  | { kind: "rate"; ratePercent: number; capJpy: number | null };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const taskLocaleByLanguage: Record<Language, AffiliateContentLocale> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko"
};

export function getLocalizedTaskContent(
  task: AffiliateMarketplaceTask,
  language: Language
): { name: string; description: string | null } {
  const translation = task.translations?.[taskLocaleByLanguage[language]];
  return {
    name: translation?.name?.trim() || task.name,
    description:
      translation && translation.description !== null
        ? translation.description
        : task.description
  };
}

export function getRemainingPercent(task: AffiliateMarketplaceTask) {
  return Math.floor(clamp(task.remainingBudgetBps, 0, 10_000) / 100);
}

export function getMaximumRewardNdp(task: AffiliateMarketplaceTask) {
  const remainingBudgetNdp = Math.max(0, task.remainingBudgetNdp);
  if (task.maxCompletedOrdersPerClaim === null) {
    return remainingBudgetNdp;
  }

  const byClaim =
    Math.max(0, task.rewardNdpPerCompletedOrder) *
    Math.max(0, task.maxCompletedOrdersPerClaim);
  return Math.min(remainingBudgetNdp, byClaim);
}

export function getDiscountPresentation(
  task: AffiliateMarketplaceTask
): AffiliateDiscountPresentation {
  if (task.customerDiscountType === "fixed_jpy") {
    return { kind: "fixed_jpy", amountJpy: Math.max(0, task.fixedDiscountJpy) };
  }
  if (task.customerDiscountType === "rate") {
    return {
      kind: "rate",
      ratePercent: clamp(task.discountRateBps, 0, 10_000) / 100,
      capJpy: task.discountCapJpy > 0 ? task.discountCapJpy : null
    };
  }
  return { kind: "none" };
}

export function getTaskTags(task: AffiliateMarketplaceTask): AffiliateTaskTag[] {
  const tags: AffiliateTaskTag[] = [];

  if (task.maxCompletedOrdersPerCustomer !== null) {
    tags.push({
      kind: "customer-limit",
      count: Math.max(0, task.maxCompletedOrdersPerCustomer)
    });
  }

  const firstService = task.services.find((service) => service.serviceNameSnapshot.trim());
  if (firstService) {
    tags.push({ kind: "service", label: firstService.serviceNameSnapshot.trim() });
  }

  if (task.minimumOrderAmountJpy > 0) {
    tags.push({ kind: "minimum-order", amountJpy: task.minimumOrderAmountJpy });
  }

  if (task.customerDiscountType === "fixed_jpy" && task.fixedDiscountJpy > 0) {
    tags.push({
      kind: "discount",
      discountType: task.customerDiscountType,
      value: task.fixedDiscountJpy
    });
  } else if (task.customerDiscountType === "rate" && task.discountRateBps > 0) {
    tags.push({
      kind: "discount",
      discountType: task.customerDiscountType,
      value: task.discountRateBps
    });
  }

  if (task.rewardNdpPerCompletedOrder >= 10_000) {
    tags.push({ kind: "high-reward", rewardNdp: task.rewardNdpPerCompletedOrder });
  }

  return tags.slice(0, 5);
}

export function getTaskDateWindow(
  task: AffiliateMarketplaceTask,
  locale: string,
  timeZone = "Asia/Tokyo"
) {
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone });
  return {
    startsAt: formatter.format(new Date(task.taskStartsAt)),
    endsAt: formatter.format(new Date(task.taskEndsAt))
  };
}
