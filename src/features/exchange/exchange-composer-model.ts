import type {
  ExchangeContentLocale,
  ExchangeDemandServiceMode,
  ExchangeRequestPublicationContext,
  ExchangeServiceMode,
  PublishExchangeDemandInput,
  PublishExchangeIntelligenceInput
} from "./types";

export type ExchangeComposerErrorKey =
  | "required"
  | "invalidWindow"
  | "invalidBudget"
  | "invalidPrice"
  | "targetProviderLimit"
  | "contextFailed"
  | "requestFeeUnavailable"
  | "requestNotAllowed"
  | "ekycRequired"
  | "insufficientFunds"
  | "publishFailed";

export function combineLocalDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

export function nullableTrim(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

export function requiredMoney(value: string): number | null {
  const amount = Number(value);
  return value.trim() !== "" && Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000
    ? amount
    : null;
}

export function optionalMoney(value: string): { valid: true; value: number | null } | { valid: false } {
  if (value.trim() === "") return { valid: true, value: null };
  const amount = requiredMoney(value);
  return amount === null ? { valid: false } : { valid: true, value: amount };
}

export type RequestComposerDraft = {
  contentLocale: ExchangeContentLocale;
  title: string;
  detail: string;
  serviceStartDate: string;
  serviceStartTime: string;
  serviceEndDate: string;
  serviceEndTime: string;
  expiresDate: string;
  expiresTime: string;
  targetProviderCount: string;
  serviceMode: ExchangeDemandServiceMode;
  matchMode: "quick" | "selective";
  budgetMode: "total" | "per_provider";
  budgetMinJpy: string;
  budgetMaxJpy: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  addressLine2Public: boolean;
  addressLine3Public: boolean;
  publisherIdentityPublic: boolean;
};

export function normalizeRequestDraft(
  draft: RequestComposerDraft,
  context: ExchangeRequestPublicationContext
): { ok: true; value: PublishExchangeDemandInput } | { ok: false; errorKey: ExchangeComposerErrorKey } {
  const targetProviderCount = Number(draft.targetProviderCount);
  const budgetMinimum = optionalMoney(draft.budgetMinJpy);
  const budgetMaxJpy = requiredMoney(draft.budgetMaxJpy);
  const serviceStartAt = combineLocalDateTime(draft.serviceStartDate, draft.serviceStartTime);
  const serviceEndAt = combineLocalDateTime(draft.serviceEndDate, draft.serviceEndTime);
  const expiresAt = combineLocalDateTime(draft.expiresDate, draft.expiresTime);
  if (
    !draft.title.trim()
    || !draft.detail.trim()
    || !draft.addressLine1.trim()
    || !serviceStartAt
    || !serviceEndAt
    || !expiresAt
    || budgetMaxJpy === null
  ) {
    return { ok: false, errorKey: "required" };
  }
  if (!budgetMinimum.valid) return { ok: false, errorKey: "invalidBudget" };
  const budgetMinJpy = budgetMinimum.value;
  if (
    !Number.isInteger(targetProviderCount)
    || targetProviderCount < 1
    || targetProviderCount > context.maxTargetProviderCount
  ) {
    return { ok: false, errorKey: "targetProviderLimit" };
  }
  if (!(serviceStartAt < serviceEndAt && serviceEndAt <= expiresAt)) {
    return { ok: false, errorKey: "invalidWindow" };
  }
  if (budgetMinJpy !== null && budgetMinJpy > budgetMaxJpy) {
    return { ok: false, errorKey: "invalidBudget" };
  }
  const addressLine2 = nullableTrim(draft.addressLine2);
  const addressLine3 = nullableTrim(draft.addressLine3);
  return {
    ok: true,
    value: {
      type: "demand",
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      contentLocale: draft.contentLocale,
      serviceStartAt,
      serviceEndAt,
      expiresAt,
      targetProviderCount,
      serviceMode: draft.serviceMode,
      matchMode: draft.matchMode,
      budgetMode: draft.budgetMode,
      budgetMinJpy,
      budgetMaxJpy,
      addressLine1: draft.addressLine1.trim(),
      addressLine2,
      addressLine3,
      addressLine2Public: addressLine2 !== null && draft.addressLine2Public,
      addressLine3Public: addressLine3 !== null && draft.addressLine3Public,
      publisherIdentityPublic: draft.publisherIdentityPublic
    }
  };
}

export type IntelligenceComposerDraft = {
  contentLocale: ExchangeContentLocale;
  title: string;
  detail: string;
  areaLabel: string;
  serviceStartDate: string;
  serviceStartTime: string;
  serviceEndDate: string;
  serviceEndTime: string;
  expiresDate: string;
  expiresTime: string;
  serviceMode: ExchangeServiceMode;
  addressLabel: string;
  serviceAreas: string;
  originalPriceJpy: string;
  campaignPriceJpy: string;
};

export function normalizeIntelligenceDraft(
  draft: IntelligenceComposerDraft
): { ok: true; value: PublishExchangeIntelligenceInput } | { ok: false; errorKey: ExchangeComposerErrorKey } {
  const serviceStartAt = combineLocalDateTime(draft.serviceStartDate, draft.serviceStartTime);
  const serviceEndAt = combineLocalDateTime(draft.serviceEndDate, draft.serviceEndTime);
  const expiresAt = combineLocalDateTime(draft.expiresDate, draft.expiresTime);
  const enteredServiceAreas = Array.from(new Set(
    draft.serviceAreas.split(/[,，、]/u).map((value) => value.trim()).filter(Boolean)
  ));
  const serviceAreas = enteredServiceAreas.length > 0
    ? enteredServiceAreas
    : draft.serviceMode === "store" && draft.areaLabel.trim()
      ? [draft.areaLabel.trim()]
      : [];
  const originalPrice = optionalMoney(draft.originalPriceJpy);
  const campaignPriceJpy = requiredMoney(draft.campaignPriceJpy);
  if (
    !draft.title.trim()
    || !draft.detail.trim()
    || !draft.areaLabel.trim()
    || !serviceStartAt
    || !serviceEndAt
    || !expiresAt
    || campaignPriceJpy === null
  ) {
    return { ok: false, errorKey: "required" };
  }
  if (!originalPrice.valid) return { ok: false, errorKey: "invalidPrice" };
  if (!(serviceStartAt < serviceEndAt && serviceEndAt <= expiresAt)) {
    return { ok: false, errorKey: "invalidWindow" };
  }
  if (originalPrice.value !== null && campaignPriceJpy > originalPrice.value) {
    return { ok: false, errorKey: "invalidPrice" };
  }
  if (serviceAreas.length === 0) return { ok: false, errorKey: "required" };
  return {
    ok: true,
    value: {
      type: "intelligence",
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      contentLocale: draft.contentLocale,
      areaLabel: draft.areaLabel.trim(),
      serviceStartAt,
      serviceEndAt,
      expiresAt,
      serviceMode: draft.serviceMode,
      addressLabel: draft.serviceMode === "store" || draft.serviceMode === "flexible"
        ? nullableTrim(draft.addressLabel)
        : null,
      serviceAreas,
      originalPriceJpy: originalPrice.value,
      campaignPriceJpy
    }
  };
}
