import type {
  ExchangeContentLocale,
  ExchangeDemandServiceMode,
  ExchangeRequestPublicationContext,
  PublishExchangeDemandInput,
  PublishExchangeIntelligenceInput
} from "./types";

export type ExchangeComposerErrorKey =
  | "required"
  | "invalidWindow"
  | "invalidRequestWindow"
  | "invalidBudget"
  | "invalidPrice"
  | "serviceRequired"
  | "targetProviderLimit"
  | "contextFailed"
  | "requestFeeUnavailable"
  | "requestNotAllowed"
  | "ekycRequired"
  | "insufficientFunds"
  | "publishFailed"
  | "demandCoverUploading"
  | "demandCoverFailed";

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

export type DemandCoverDraft = {
  previewUrl: string;
  publicId: string | null;
  status: "ready" | "uploading" | "failed";
  uploadedUrl: string | null;
};

export type RequestComposerDraft = {
  contentLocale: ExchangeContentLocale;
  cover: DemandCoverDraft | null;
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

function defaultApplicationDeadline(date: string, time: string): { date: string; time: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:(?:00|30)$/.test(time)) return null;
  const start = new Date(`${date}T${time}:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date) return null;
  const deadline = new Date(start.getTime() - 30 * 60_000).toISOString();
  return { date: deadline.slice(0, 10), time: deadline.slice(11, 16) };
}

export function applyRequestDraftPatch(current: RequestComposerDraft, patch: Partial<RequestComposerDraft>): RequestComposerDraft {
  const next = { ...current, ...patch };
  if (("serviceStartDate" in patch || "serviceStartTime" in patch)
    && !("expiresDate" in patch || "expiresTime" in patch)) {
    const previousDefault = defaultApplicationDeadline(current.serviceStartDate, current.serviceStartTime);
    const usesDefault = (!current.expiresDate && !current.expiresTime)
      || (current.expiresDate === previousDefault?.date && current.expiresTime === previousDefault.time);
    if (usesDefault) {
      const updatedDefault = defaultApplicationDeadline(next.serviceStartDate, next.serviceStartTime);
      next.expiresDate = updatedDefault?.date ?? "";
      next.expiresTime = updatedDefault?.time ?? "";
    }
  }
  return next;
}

export function normalizeRequestDraft(
  draft: RequestComposerDraft,
  context: ExchangeRequestPublicationContext
): { ok: true; value: PublishExchangeDemandInput } | { ok: false; errorKey: ExchangeComposerErrorKey } {
  if (draft.cover?.status === "uploading") return { ok: false, errorKey: "demandCoverUploading" };
  if (draft.cover && (
    draft.cover.status !== "ready"
    || !draft.cover.uploadedUrl
    || !/^[a-f0-9]{64}$/u.test(draft.cover.publicId ?? "")
  )) return { ok: false, errorKey: "demandCoverFailed" };
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
  if (!(expiresAt < serviceStartAt && serviceStartAt < serviceEndAt)
    || ![draft.serviceStartTime, draft.serviceEndTime, draft.expiresTime].every((time) => /^\d{2}:(?:00|30)$/.test(time))) {
    return { ok: false, errorKey: "invalidRequestWindow" };
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
      ...(draft.cover ? { coverMediaAssetPublicId: draft.cover.publicId! } : {}),
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
  serviceRef: string;
  serviceStartDate: string;
  serviceStartTime: string;
  serviceEndDate: string;
  serviceEndTime: string;
  expiresDate: string;
  expiresTime: string;
  campaignPriceJpy: string;
};

export function normalizeIntelligenceDraft(
  draft: IntelligenceComposerDraft,
  catalogPriceJpy: number | null
): { ok: true; value: PublishExchangeIntelligenceInput } | { ok: false; errorKey: ExchangeComposerErrorKey } {
  const serviceStartAt = combineLocalDateTime(draft.serviceStartDate, draft.serviceStartTime);
  const serviceEndAt = combineLocalDateTime(draft.serviceEndDate, draft.serviceEndTime);
  const expiresAt = combineLocalDateTime(draft.expiresDate, draft.expiresTime);
  const campaignPriceJpy = requiredMoney(draft.campaignPriceJpy);
  if (!/^(?:shop|technician):[1-9]\d*$/u.test(draft.serviceRef)) {
    return { ok: false, errorKey: "serviceRequired" };
  }
  if (
    !draft.title.trim()
    || !draft.detail.trim()
    || !serviceStartAt
    || !serviceEndAt
    || !expiresAt
    || campaignPriceJpy === null
  ) {
    return { ok: false, errorKey: "required" };
  }
  if (!(serviceStartAt < serviceEndAt && serviceEndAt < expiresAt)) {
    return { ok: false, errorKey: "invalidWindow" };
  }
  if (catalogPriceJpy === null || campaignPriceJpy > catalogPriceJpy) {
    return { ok: false, errorKey: "invalidPrice" };
  }
  return {
    ok: true,
    value: {
      type: "intelligence",
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      contentLocale: draft.contentLocale,
      serviceRef: draft.serviceRef as PublishExchangeIntelligenceInput["serviceRef"],
      serviceStartAt,
      serviceEndAt,
      expiresAt,
      campaignPriceJpy
    }
  };
}
