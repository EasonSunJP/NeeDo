import type {
  AffiliatePlatformFeeRule,
  AffiliatePlatformFeeRuleCreateInput,
  AffiliatePlatformFeeScope,
  AffiliatePlatformFeeShopOption
} from "../../api/affiliatePlatformFee";

export type AffiliateFeeEffectiveMode = "now" | "scheduled";
export type AffiliateFeeRuleStatus = "current" | "scheduled" | "historical";

export interface AffiliateFeeDraft {
  scopeType: AffiliatePlatformFeeScope;
  shop: AffiliatePlatformFeeShopOption | null;
  percent: string;
  effectiveMode: AffiliateFeeEffectiveMode;
  scheduledAt: string;
  reason: string;
}

export interface AffiliateFeeDraftErrors {
  shop?: "required";
  percent?: "invalid";
  scheduledAt?: "future";
  reason?: "invalid";
}

export function toFeeBps(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const bps = Math.round(Number(normalized) * 100);
  return Number.isInteger(bps) && bps >= 0 && bps <= 10_000 ? bps : null;
}

export function classifyAffiliateFeeRule(
  rule: Pick<AffiliatePlatformFeeRule, "effectiveFrom" | "effectiveTo">,
  evaluatedAt: string
): AffiliateFeeRuleStatus {
  const boundary = Date.parse(evaluatedAt);
  const effectiveFrom = Date.parse(rule.effectiveFrom);
  if (effectiveFrom > boundary) return "scheduled";
  if (rule.effectiveTo === null || Date.parse(rule.effectiveTo) > boundary) {
    return "current";
  }
  return "historical";
}

export function validateAffiliateFeeDraft(
  draft: AffiliateFeeDraft,
  now: Date
): AffiliateFeeDraftErrors {
  const scheduledAt = draft.scheduledAt ? Date.parse(draft.scheduledAt) : Number.NaN;
  return {
    ...(draft.scopeType === "shop" && !draft.shop ? { shop: "required" as const } : {}),
    ...(toFeeBps(draft.percent) === null ? { percent: "invalid" as const } : {}),
    ...(draft.effectiveMode === "scheduled" &&
    (!Number.isFinite(scheduledAt) || scheduledAt <= now.getTime())
      ? { scheduledAt: "future" as const }
      : {}),
    ...(!draft.reason.trim() || draft.reason.trim().length > 500
      ? { reason: "invalid" as const }
      : {})
  };
}

export function buildAffiliateFeeCreateInput(
  draft: AffiliateFeeDraft,
  expectedVersion: number,
  now: Date
): AffiliatePlatformFeeRuleCreateInput {
  const feeBps = toFeeBps(draft.percent);
  if (feeBps === null || expectedVersion < 0 || !Number.isInteger(expectedVersion)) {
    throw new Error("Invalid Affiliate fee rule draft");
  }
  if (draft.scopeType === "shop" && !draft.shop) {
    throw new Error("Affiliate fee rule shop is required");
  }

  return {
    scopeType: draft.scopeType,
    shopId: draft.scopeType === "shop" ? draft.shop?.id ?? null : null,
    feeBps,
    expectedVersion,
    effectiveFrom:
      draft.effectiveMode === "now"
        ? now.toISOString()
        : new Date(draft.scheduledAt).toISOString(),
    reason: draft.reason.trim()
  };
}
