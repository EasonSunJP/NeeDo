import type { MembershipRewardFeeVersionCreateInput } from "../../api/membershipRewardFee";

export type MembershipRewardFeeDraft = { percent: string; effectiveFrom: string; reason: string };
export type MembershipRewardFeeDraftErrors = { percent?: "invalid"; effectiveFrom?: "future"; reason?: "invalid" };

export function parseFeePercent(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isInteger(bps) && bps >= 0 && bps <= 10_000 ? bps : null;
}

export function validateMembershipRewardFeeDraft(draft: MembershipRewardFeeDraft, now: Date): MembershipRewardFeeDraftErrors {
  const effectiveAt = Date.parse(draft.effectiveFrom);
  return {
    ...(parseFeePercent(draft.percent) === null ? { percent: "invalid" as const } : {}),
    ...(!Number.isFinite(effectiveAt) || effectiveAt < now.getTime() ? { effectiveFrom: "future" as const } : {}),
    ...(!draft.reason.trim() || draft.reason.trim().length > 500 ? { reason: "invalid" as const } : {})
  };
}

export function buildMembershipRewardFeeInput(draft: MembershipRewardFeeDraft, expectedVersion: number): MembershipRewardFeeVersionCreateInput {
  const feeRateBps = parseFeePercent(draft.percent);
  const effectiveFrom = new Date(draft.effectiveFrom);
  if (feeRateBps === null || !Number.isInteger(expectedVersion) || expectedVersion < 0 || Number.isNaN(effectiveFrom.getTime()) || !draft.reason.trim()) throw new Error("invalid_membership_reward_fee");
  return { feeRateBps, expectedVersion, effectiveFrom: effectiveFrom.toISOString(), reason: draft.reason.trim() };
}

export function classifyMembershipRewardFeeVersion(version: { effectiveFrom: string; effectiveTo: string | null }, evaluatedAt: string): "current" | "scheduled" | "historical" {
  const boundary = Date.parse(evaluatedAt);
  if (Date.parse(version.effectiveFrom) > boundary) return "scheduled";
  return version.effectiveTo === null || Date.parse(version.effectiveTo) > boundary ? "current" : "historical";
}
