export const platformTierCodes = ["free", "silver", "gold", "black_diamond"] as const;
export type PlatformTierCode = (typeof platformTierCodes)[number];

export const platformBenefitCodes = [
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift"
] as const;
export type PlatformBenefitCode = (typeof platformBenefitCodes)[number];
export type PublicationStatus = "draft" | "published" | "archived";

export type Paginated<T> = {
  list: T[];
  total: number;
  page: number;
  page_size: number;
};

export type UserDirectoryScope = "operations" | "merchant";
export type UserPrivacyScope = "public" | "privateAll" | "limited" | "network";

export type PlatformManagedUser = {
  id: number;
  needoId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string | null;
  emailBound: boolean;
  phoneBound: boolean;
  avatarUrl: string | null;
  city: string | null;
  privacyMode: boolean;
  privacyScope: UserPrivacyScope | null;
  isActive: boolean;
  isTestAccount: boolean;
  source: string[];
  identities: Array<{
    type: string;
    displayName: string | null;
    scopeType: string | null;
    scopeId: number | null;
  }>;
  roles: Array<{ code: string; name: string }>;
  groups: string[];
  ekycVerified: boolean;
  membership: {
    tierCode: PlatformTierCode;
    tierVersionPublicId: string | null;
    entitlementPublicId: string | null;
    expiresAt: string | null;
    experienceMultiplier: number;
    lockVersion: number | null;
  };
  experience: { currentLevel: number; totalExpUnits: string } | null;
  ndpBalance: { available: number; frozen: number };
  bookingCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformManagedUserDetail = PlatformManagedUser & {
  profile: {
    displayName: string;
    bio: string | null;
    city: string | null;
    gender: string | null;
    age: number | null;
    heightCm: string | null;
    languages: unknown[];
  } | null;
  account: {
    roles: Array<{
      code: string;
      name: string;
      scopeType: string | null;
      scopeId: number | null;
      permissions: string[];
    }>;
  };
  bookingSpend: {
    totalBookings: number;
    completedBookings: number;
    completedSpendJpy: number;
  };
  audit: {
    total: number;
    list: Array<{
      id: string;
      action: string;
      actorName: string;
      actorAvatarUrl: string | null;
      createdAt: string;
      metadata: unknown;
    }>;
  };
};

export type UserListQuery = {
  page?: number;
  page_size?: number;
  keyword?: string;
  tier?: PlatformTierCode;
  groupCode?: string;
  identityType?: string;
  source?: string;
  state?: "active" | "inactive";
  ekyc?: "verified" | "unverified";
  minLevel?: number;
  maxLevel?: number;
  minExpUnits?: string;
  maxExpUnits?: string;
  minNdpBalance?: number;
  maxNdpBalance?: number;
  city?: string;
  emailState?: "set" | "unset";
  privacy?: "enabled" | "disabled" | UserPrivacyScope;
  minBookings?: number;
  maxBookings?: number;
  sortBy?: "displayName" | "email" | "city" | "createdAt";
  sortDirection?: "asc" | "desc";
  registeredFrom?: string;
  registeredTo?: string;
};

export type UserGroup = {
  code: string;
  kind: "system" | "custom";
  name: string;
  description: string | null;
  status: "active" | "archived";
  mutableName: boolean;
  memberCount: number;
};

export type UserGroupMember = {
  needoId: string;
  username: string;
  avatarUrl: string | null;
  email: string;
};

export type UserGlobalPolicy = {
  versionPublicId: string;
  version: number;
  status: PublicationStatus;
  lockVersion: number;
  requirePhone: boolean;
  requireEmail: boolean;
  requireHomeServiceEkyc: boolean;
  requireStoreServiceEkyc: boolean;
  ndpPerBaseExp: number;
  baseExpUnitsPerThreshold: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedAt: string | null;
};

export type NdpExperienceCampaign = {
  versionPublicId: string;
  version: number;
  name: string;
  description: string | null;
  status: PublicationStatus;
  factorBps: number;
  effectiveFrom: string;
  effectiveTo: string;
  publishedAt: string | null;
  lockVersion: number;
};

export type PlatformMembershipTheme = {
  detailAccentColor: string;
  detailSurfaceColor: string;
  detailItemSurfaceColor: string;
  detailOuterBorderColor: string;
  detailItemBorderColor: string;
  detailAvatarBorderColor: string;
  simpleTopColor: string;
  simpleBottomColor: string;
};

export type TierBenefitDraft = {
  code: PlatformBenefitCode;
  isEnabled: boolean;
  configuration: Record<string, unknown>;
};

export type PlatformTierVersion = {
  tierCode: PlatformTierCode;
  tierVersionPublicId: string;
  version: number;
  status: PublicationStatus;
  lockVersion: number;
  durationDays: number | null;
  monthlyValueNdp: number;
  annualBillingMonths: number;
  experienceMultiplier: number;
  description: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedAt: string | null;
  theme: PlatformMembershipTheme;
  benefits: TierBenefitDraft[];
};

export type PlatformTierAdministration = {
  tierCode: PlatformTierCode;
  sortOrder: number;
  publishedVersion: PlatformTierVersion | null;
  draftVersion: PlatformTierVersion | null;
};

export type PlatformBenefitAdministration = {
  code: PlatformBenefitCode;
  sortOrder: number;
  isGloballyEnabled: boolean;
  nameTranslations: PlatformBenefitLocalizedText;
  descriptionTranslations: PlatformBenefitLocalizedText;
  lockVersion: number;
};

export type PlatformBenefitLocalizedText = {
  zh: string;
  "zh-Hant": string;
  ja: string;
  en: string;
  ko: string;
};

export type UserExperienceEntry = {
  publicId: string;
  eventType: string;
  sourceType: string;
  sourcePublicId: string | null;
  baseExp: string;
  campaignFactorBps: number;
  membershipMultiplierBps: number;
  extraExp: string;
  finalExp: string;
  membershipTierCode: PlatformTierCode | null;
  membershipTierVersionId: string | null;
  policyVersionId: string | null;
  campaignVersionId: string | null;
  occurredAt: string;
};
