export const PLATFORM_MEMBERSHIP_TIER_CODES = ["free", "silver", "gold", "black_diamond"] as const;

export type PlatformMembershipTierCodeValue = (typeof PLATFORM_MEMBERSHIP_TIER_CODES)[number];

export const PLATFORM_MEMBERSHIP_BENEFIT_CODES = [
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift",
  "traceless_recall"
] as const;

export type PlatformMembershipBenefitCodeValue = (typeof PLATFORM_MEMBERSHIP_BENEFIT_CODES)[number];

export interface PlatformMembershipTheme {
  detailAccentColor: string;
  detailSurfaceColor: string;
  detailItemSurfaceColor: string;
  detailOuterBorderColor: string;
  detailItemBorderColor: string;
  detailAvatarBorderColor: string;
  simpleTopColor: string;
  simpleBottomColor: string;
}
