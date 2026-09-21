export const platformTierCodes = ["free", "silver", "gold", "black_diamond"] as const;
export type PlatformTierCode = (typeof platformTierCodes)[number];

export const platformBenefitCodes = [
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift",
  "traceless_recall"
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
export type UserMembershipAdjustmentInput = {
  tierCode?: PlatformTierCode;
  multiplier?: number;
  reason: string;
  expectedLockVersion: number | null;
};

export type ReceivedUserReview = {
  reviewId: number;
  targetType: "customer";
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  amendmentVersion: number;
  amendmentHistory: Array<{
    version: number;
    rating: number | null;
    comment: string | null;
    tags: string[];
    reason: string;
    revisedAt: string;
    revisedBy: string;
  }>;
  order: {
    id: number; orderNo: string; serviceName: string; startsAt: string;
    shopName: string; durationMinutes: number | null; note: string | null;
    paymentMethod: "onsite" | "bank_transfer" | "cash" | "ndp" | "other";
    paymentStatus: "pending" | "confirmed" | "refund_pending" | "refunded";
    paymentCurrency: string | null; otherPaymentMethod: string | null;
    addOnCount: number; addOnMinutes: number;
  };
  reviewer: { needoId: string; displayName: string; avatarUrl: string | null };
};

export type UserReviewAmendmentInput = {
  rating?: number;
  comment?: string | null;
  tags?: string[];
  reason: string;
  expectedVersion: number;
};

export type OperationsReviewStatus = "original" | "amended" | "system";

export type OperationsReview = Omit<ReceivedUserReview, "targetType"> & {
  targetType: "customer" | "technician";
  status: OperationsReviewStatus;
  customer: { needoId: string; displayName: string };
  shop: { id: number; publicId: string | null; name: string };
  technician: { id: number; publicId: string; displayName: string } | null;
};

export type OperationsReviewQuery = {
  page?: number;
  page_size?: 20;
  keyword?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  status?: OperationsReviewStatus;
  targetType?: "customer" | "technician";
  from?: string;
  to?: string;
};

export type UserUsagePeriod = "last7days" | "thisWeek" | "last30days" | "thisMonth" | "thisYear" | "custom";
export type UserUsageQuery = {
  page?: number;
  page_size?: 10;
  keyword?: string;
  period?: UserUsagePeriod;
  from?: string;
  to?: string;
};
export type UserUsageRefund = {
  exists: boolean;
  displayReference: string | null;
  note: string | null;
  amendmentVersion: number;
};
export type UserUsage = {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: string;
  serviceName: string;
  shopName: string;
  technicianName: string | null;
  startsAt: string;
  endsAt: string;
  priceAmount: number;
  currency: string;
  refund: UserUsageRefund;
};
export type UserUsageTimelineEntry = {
  id: string;
  type: "order_created" | "status" | "service" | "comment" | "refund";
  code: string;
  occurredAt: string;
  actorName: string | null;
  actorAvatarUrl?: string | null;
  body: string | null;
};
export type UserUsageTimeline = { order: UserUsage; timeline: UserUsageTimelineEntry[] };

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
  identityProfiles?: Array<{
    type: "technician" | "merchant";
    status: "active" | "not_enabled" | "under_review" | "rejected";
    displayName: string | null;
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
  experience: { currentLevel: number; totalExp: string } | null;
  ndpBalance: { available: number; frozen: number };
  testNdpBalance?: { available: number; frozen: number } | null;
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
  metrics: {
    ndpAvailable: number;
    usageCount: number;
    credit: {
      ratingAverage: number;
      reviewCount: number;
      latestReviewAt: string | null;
    };
  };
  capabilities: {
    membershipWrite: boolean;
    reviewAmend: boolean;
    refundAmend: boolean;
    partnerWrite: boolean;
    timelineCommentWrite: boolean;
  };
  audit: {
    page?: number;
    page_size?: number;
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
  tiers?: PlatformTierCode[];
  groupCode?: string;
  identityType?: PlatformIdentityType;
  identityTypes?: PlatformIdentityType[];
  source?: string;
  isTestAccount?: boolean;
  state?: "active" | "inactive";
  states?: Array<"active" | "inactive">;
  ekyc?: "verified" | "unverified";
  ekycStates?: Array<"verified" | "unverified">;
  minLevel?: number;
  maxLevel?: number;
  minExpUnits?: string;
  maxExpUnits?: string;
  minNdpBalance?: number;
  maxNdpBalance?: number;
  city?: string;
  cities?: string[];
  emailState?: "set" | "unset";
  emailStates?: Array<"set" | "unset">;
  privacy?: "enabled" | "disabled" | UserPrivacyScope;
  privacyScopes?: Array<"enabled" | "disabled" | UserPrivacyScope>;
  minBookings?: number;
  maxBookings?: number;
  sortBy?: "displayName" | "email" | "city" | "createdAt" | "ndpBalance" | "bookingCount";
  sortDirection?: "asc" | "desc";
  registeredFrom?: string;
  registeredTo?: string;
};

export type PlatformIdentityType = "platform" | "customer" | "technician" | "merchant" | "broker" | "scout";

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
  id: number;
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
  requireMerchantApplicationEkyc: boolean;
  requireTechnicianApplicationEkyc: boolean;
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
  detailSurfaceMiddleColor: string;
  detailSurfaceBottomColor: string;
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
  deliveryCapability?: "available" | "unavailable";
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

export type AccountUserLogDetail = Pick<PlatformManagedUserDetail, "id" | "displayName" | "avatarUrl" | "createdAt" | "audit">;
export type AccountActivitySubject = { scope: UserDirectoryScope; subject: "users" | "technicians"; id: number };
