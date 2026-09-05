import { httpClient, type ApiQueryValue } from "../../api/httpClient";
import {
  platformBenefitCodes,
  platformTierCodes,
  type NdpExperienceCampaign,
  type Paginated,
  type PlatformBenefitAdministration,
  type PlatformBenefitCode,
  type PlatformBenefitLocalizedText,
  type PlatformManagedUser,
  type PlatformManagedUserDetail,
  type PlatformMembershipTheme,
  type PlatformTierAdministration,
  type PlatformTierCode,
  type PlatformTierVersion,
  type TierBenefitDraft,
  type UserExperienceEntry,
  type UserGlobalPolicy,
  type UserGroup,
  type UserGroupMember,
  type UserListQuery,
  type UserDirectoryScope
} from "./types";

type UnknownRecord = Record<string, unknown>;
type PageQuery = { page?: number; page_size?: number };

const invalid = (): never => {
  throw new TypeError("Invalid user management response");
};

const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : invalid();
const string = (value: unknown): string => (typeof value === "string" ? value : invalid());
const nullableString = (value: unknown): string | null =>
  value === null ? null : string(value);
const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : invalid();
const integer = (value: unknown): number =>
  Number.isInteger(value) ? (value as number) : invalid();
const boolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : invalid();
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const timestamp = (value: unknown): string => {
  const result = string(value);
  return Number.isNaN(Date.parse(result)) ? invalid() : result;
};
const nullableTimestamp = (value: unknown): string | null =>
  value === null ? null : timestamp(value);
const enumValue = <TValue extends string>(value: unknown, values: readonly TValue[]): TValue =>
  typeof value === "string" && values.includes(value as TValue) ? (value as TValue) : invalid();

const decodePage = <TItem>(value: unknown, decodeItem: (item: unknown) => TItem): Paginated<TItem> => {
  const raw = record(value);
  return {
    list: array(raw.list).map(decodeItem),
    total: integer(raw.total),
    page: integer(raw.page),
    page_size: integer(raw.page_size)
  };
};

const decodeUser = (value: unknown): PlatformManagedUser => {
  const raw = record(value);
  const membership = record(raw.membership);
  const balance = record(raw.ndpBalance);
  const experience = raw.experience === null ? null : record(raw.experience);
  return {
    id: integer(raw.id),
    needoId: string(raw.needoId),
    username: string(raw.username),
    displayName: string(raw.displayName),
    email: string(raw.email),
    phone: nullableString(raw.phone),
    emailBound: boolean(raw.emailBound),
    phoneBound: boolean(raw.phoneBound),
    avatarUrl: nullableString(raw.avatarUrl),
    city: nullableString(raw.city),
    privacyMode: boolean(raw.privacyMode),
    privacyScope: raw.privacyScope === null
      ? null
      : enumValue(raw.privacyScope, ["public", "privateAll", "limited", "network"] as const),
    isActive: boolean(raw.isActive),
    isTestAccount: boolean(raw.isTestAccount),
    source: array(raw.source).map(string),
    identities: array(raw.identities).map((item) => {
      const identity = record(item);
      return {
        type: string(identity.type),
        displayName: nullableString(identity.displayName),
        scopeType: nullableString(identity.scopeType),
        scopeId: identity.scopeId === null ? null : integer(identity.scopeId)
      };
    }),
    roles: array(raw.roles).map((item) => {
      const role = record(item);
      return { code: string(role.code), name: string(role.name) };
    }),
    groups: array(raw.groups).map(string),
    ekycVerified: boolean(raw.ekycVerified),
    membership: {
      tierCode: enumValue(membership.tierCode, platformTierCodes),
      tierVersionPublicId: nullableString(membership.tierVersionPublicId),
      entitlementPublicId: nullableString(membership.entitlementPublicId),
      expiresAt: nullableTimestamp(membership.expiresAt),
      experienceMultiplier: number(membership.experienceMultiplier),
      lockVersion: membership.lockVersion === null ? null : integer(membership.lockVersion)
    },
    experience: experience
      ? {
          currentLevel: integer(experience.currentLevel),
          totalExpUnits: string(experience.totalExpUnits)
        }
      : null,
    ndpBalance: { available: integer(balance.available), frozen: integer(balance.frozen) },
    bookingCount: integer(raw.bookingCount),
    lastLoginAt: nullableTimestamp(raw.lastLoginAt),
    createdAt: timestamp(raw.createdAt),
    updatedAt: timestamp(raw.updatedAt)
  };
};

const decodeUserDetail = (value: unknown): PlatformManagedUserDetail => {
  const raw = record(value);
  const summary = decodeUser(value);
  const profile = raw.profile === null ? null : record(raw.profile);
  const account = record(raw.account);
  const bookingSpend = record(raw.bookingSpend);
  const audit = record(raw.audit);
  return {
    ...summary,
    profile: profile
      ? {
          displayName: string(profile.displayName),
          bio: nullableString(profile.bio),
          city: nullableString(profile.city),
          gender: nullableString(profile.gender),
          age: profile.age === null ? null : integer(profile.age),
          heightCm: nullableString(profile.heightCm),
          languages: array(profile.languages)
        }
      : null,
    account: {
      roles: array(account.roles).map((item) => {
        const role = record(item);
        return {
          code: string(role.code),
          name: string(role.name),
          scopeType: nullableString(role.scopeType),
          scopeId: role.scopeId === null ? null : integer(role.scopeId),
          permissions: array(role.permissions).map(string)
        };
      })
    },
    bookingSpend: {
      totalBookings: integer(bookingSpend.totalBookings),
      completedBookings: integer(bookingSpend.completedBookings),
      completedSpendJpy: number(bookingSpend.completedSpendJpy)
    },
    audit: {
      total: integer(audit.total),
      list: array(audit.list).map((item) => {
        const event = record(item);
        return {
          id: string(event.id),
          action: string(event.action),
          actorName: string(event.actorName),
          actorAvatarUrl: nullableString(event.actorAvatarUrl),
          createdAt: timestamp(event.createdAt),
          metadata: event.metadata
        };
      })
    }
  };
};

const decodeGroup = (value: unknown): UserGroup => {
  const raw = record(value);
  return {
    code: string(raw.code),
    kind: enumValue(raw.kind, ["system", "custom"] as const),
    name: string(raw.name),
    description: nullableString(raw.description),
    status: enumValue(raw.status, ["active", "archived"] as const),
    mutableName: boolean(raw.mutableName),
    memberCount: integer(raw.memberCount)
  };
};

const decodeGroupMember = (value: unknown): UserGroupMember => {
  const raw = record(value);
  return {
    needoId: string(raw.needoId),
    username: string(raw.username),
    avatarUrl: nullableString(raw.avatarUrl),
    email: string(raw.email)
  };
};

const publicationStatuses = ["draft", "published", "archived"] as const;
const decodePolicy = (value: unknown): UserGlobalPolicy => {
  const raw = record(value);
  return {
    versionPublicId: string(raw.versionPublicId),
    version: integer(raw.version),
    status: enumValue(raw.status, publicationStatuses),
    lockVersion: integer(raw.lockVersion),
    requirePhone: boolean(raw.requirePhone),
    requireEmail: boolean(raw.requireEmail),
    requireHomeServiceEkyc: boolean(raw.requireHomeServiceEkyc),
    requireStoreServiceEkyc: boolean(raw.requireStoreServiceEkyc),
    ndpPerBaseExp: integer(raw.ndpPerBaseExp),
    baseExpUnitsPerThreshold: integer(raw.baseExpUnitsPerThreshold),
    effectiveFrom: timestamp(raw.effectiveFrom),
    effectiveTo: nullableTimestamp(raw.effectiveTo),
    publishedAt: nullableTimestamp(raw.publishedAt)
  };
};

const decodeCampaign = (value: unknown): NdpExperienceCampaign => {
  const raw = record(value);
  return {
    versionPublicId: string(raw.versionPublicId),
    version: integer(raw.version),
    name: string(raw.name),
    description: nullableString(raw.description),
    status: enumValue(raw.status, publicationStatuses),
    factorBps: integer(raw.factorBps),
    effectiveFrom: timestamp(raw.effectiveFrom),
    effectiveTo: timestamp(raw.effectiveTo),
    publishedAt: nullableTimestamp(raw.publishedAt),
    lockVersion: integer(raw.lockVersion)
  };
};

const decodeTheme = (value: unknown): PlatformMembershipTheme => {
  const raw = record(value);
  return {
    detailAccentColor: string(raw.detailAccentColor),
    detailSurfaceColor: string(raw.detailSurfaceColor),
    detailItemSurfaceColor: string(raw.detailItemSurfaceColor),
    detailOuterBorderColor: string(raw.detailOuterBorderColor),
    detailItemBorderColor: string(raw.detailItemBorderColor),
    detailAvatarBorderColor: string(raw.detailAvatarBorderColor),
    simpleTopColor: string(raw.simpleTopColor),
    simpleBottomColor: string(raw.simpleBottomColor)
  };
};

const decodeBenefitDraft = (value: unknown): TierBenefitDraft => {
  const raw = record(value);
  return {
    code: enumValue(raw.code, platformBenefitCodes),
    isEnabled: boolean(raw.isEnabled),
    configuration: record(raw.configuration)
  };
};

const decodeTierVersion = (value: unknown): PlatformTierVersion => {
  const raw = record(value);
  return {
    tierCode: enumValue(raw.tierCode, platformTierCodes),
    tierVersionPublicId: string(raw.tierVersionPublicId),
    version: integer(raw.version),
    status: enumValue(raw.status, publicationStatuses),
    lockVersion: integer(raw.lockVersion),
    durationDays: raw.durationDays === null ? null : integer(raw.durationDays),
    monthlyValueNdp: integer(raw.monthlyValueNdp),
    annualBillingMonths: integer(raw.annualBillingMonths),
    experienceMultiplier: number(raw.experienceMultiplier),
    description: nullableString(raw.description),
    effectiveFrom: timestamp(raw.effectiveFrom),
    effectiveTo: nullableTimestamp(raw.effectiveTo),
    publishedAt: nullableTimestamp(raw.publishedAt),
    theme: decodeTheme(raw.theme),
    benefits: array(raw.benefits).map(decodeBenefitDraft)
  };
};

const decodeTier = (value: unknown): PlatformTierAdministration => {
  const raw = record(value);
  return {
    tierCode: enumValue(raw.tierCode, platformTierCodes),
    sortOrder: integer(raw.sortOrder),
    publishedVersion: raw.publishedVersion === null ? null : decodeTierVersion(raw.publishedVersion),
    draftVersion: raw.draftVersion === null ? null : decodeTierVersion(raw.draftVersion)
  };
};

const decodeBenefit = (value: unknown): PlatformBenefitAdministration => {
  const raw = record(value);
  const decodeLocalizedText = (input: unknown): PlatformBenefitLocalizedText => {
    const localized = record(input);
    return {
      zh: string(localized.zh),
      "zh-Hant": string(localized["zh-Hant"]),
      ja: string(localized.ja),
      en: string(localized.en),
      ko: string(localized.ko)
    };
  };
  return {
    code: enumValue(raw.code, platformBenefitCodes),
    sortOrder: integer(raw.sortOrder),
    isGloballyEnabled: boolean(raw.isGloballyEnabled),
    nameTranslations: decodeLocalizedText(raw.nameTranslations),
    descriptionTranslations: decodeLocalizedText(raw.descriptionTranslations),
    lockVersion: integer(raw.lockVersion)
  };
};

const decodeExperienceEntry = (value: unknown): UserExperienceEntry => {
  const raw = record(value);
  return {
    publicId: string(raw.publicId),
    eventType: string(raw.eventType),
    sourceType: string(raw.sourceType),
    sourcePublicId: nullableString(raw.sourcePublicId),
    baseExp: string(raw.baseExp),
    campaignFactorBps: integer(raw.campaignFactorBps),
    membershipMultiplierBps: integer(raw.membershipMultiplierBps),
    extraExp: string(raw.extraExp),
    finalExp: string(raw.finalExp),
    membershipTierCode: raw.membershipTierCode === null ? null : enumValue(raw.membershipTierCode, platformTierCodes),
    membershipTierVersionId: nullableString(raw.membershipTierVersionId),
    policyVersionId: nullableString(raw.policyVersionId),
    campaignVersionId: nullableString(raw.campaignVersionId),
    occurredAt: timestamp(raw.occurredAt)
  };
};

const pageQuery = (query: PageQuery): Record<string, ApiQueryValue> => ({
  page: query.page,
  pageSize: query.page_size
});

const userQuery = (query: UserListQuery): Record<string, ApiQueryValue> => {
  const { page_size, ...rest } = query;
  return { ...rest, pageSize: page_size };
};

export const platformUserManagementApi = {
  async listUsers(scope: UserDirectoryScope, query: UserListQuery = {}) {
    const path = scope === "operations" ? "/backoffice/users" : "/merchant-admin/users";
    return decodePage(
      await httpClient.request<unknown>(path, { query: userQuery(query) }),
      decodeUser
    );
  },
  async getUser(userId: number) {
    return decodeUserDetail(await httpClient.request<unknown>(`/backoffice/users/${userId}`));
  },
  async listGroups(query: PageQuery = {}) {
    return decodePage(
      await httpClient.request<unknown>("/backoffice/user-groups", { query: pageQuery(query) }),
      decodeGroup
    );
  },
  async listGroupMembers(groupCode: string, query: PageQuery = {}) {
    return decodePage(
      await httpClient.request<unknown>(`/backoffice/user-groups/${encodeURIComponent(groupCode)}/members`, { query: pageQuery(query) }),
      decodeGroupMember
    );
  },
  async createGroup(body: { name: string; description?: string | null }) {
    return decodeGroup(await httpClient.request<unknown>("/backoffice/user-groups", { method: "POST", body }));
  },
  async updateGroup(groupCode: string, body: { name: string; description?: string | null }) {
    return decodeGroup(await httpClient.request<unknown>(`/backoffice/user-groups/${encodeURIComponent(groupCode)}`, { method: "PUT", body }));
  },
  archiveGroup(groupCode: string, reason: string) {
    return httpClient.request<{ archived: true }>(`/backoffice/user-groups/${encodeURIComponent(groupCode)}/archive`, { method: "POST", body: { reason } });
  },
  setGroupMembers(groupCode: string, body: { userIds: string[]; reason: string }) {
    return httpClient.request<{ kind: "updated"; added: number; removed: number; unchanged: number }>(`/backoffice/user-groups/${encodeURIComponent(groupCode)}/members`, { method: "PUT", body });
  },
  async getGlobalSettings() {
    const raw = record(await httpClient.request<unknown>("/backoffice/user-global-settings"));
    return {
      current: raw.current === null ? null : decodePolicy(raw.current),
      draft: raw.draft === null ? null : decodePolicy(raw.draft)
    };
  },
  async saveGlobalSettingsDraft(body: {
    expectedCurrentVersion: number;
    expectedDraftLockVersion: number | null;
    requirePhone: boolean;
    requireEmail: boolean;
    requireHomeServiceEkyc: boolean;
    requireStoreServiceEkyc: boolean;
    ndpPerBaseExp: number;
    baseExpUnitsPerThreshold: number;
    effectiveFrom: string;
  }) {
    return decodePolicy(await httpClient.request<unknown>("/backoffice/user-global-settings/draft", { method: "PUT", body }));
  },
  async publishGlobalSettings(body: { expectedVersion: number; expectedLockVersion: number }) {
    return decodePolicy(await httpClient.request<unknown>("/backoffice/user-global-settings/publish", { method: "POST", body }));
  },
  async listCampaigns(query: PageQuery = {}) {
    return decodePage(
      await httpClient.request<unknown>("/backoffice/ndp-experience-campaigns", { query: pageQuery(query) }),
      decodeCampaign
    );
  },
  async saveCampaignDraft(body: {
    expectedPublishedVersion: number;
    expectedDraftLockVersion: number | null;
    name: string;
    description: string | null;
    factorBps: number;
    effectiveFrom: string;
    effectiveTo: string;
  }) {
    return decodeCampaign(await httpClient.request<unknown>("/backoffice/ndp-experience-campaigns/draft", { method: "PUT", body }));
  },
  async publishCampaign(versionPublicId: string, body: { expectedVersion: number; expectedLockVersion: number }) {
    return decodeCampaign(await httpClient.request<unknown>(`/backoffice/ndp-experience-campaigns/${encodeURIComponent(versionPublicId)}/publish`, { method: "POST", body }));
  },
  async archiveCampaign(versionPublicId: string, body: { expectedVersion: number; expectedLockVersion: number; reason: string }) {
    return decodeCampaign(await httpClient.request<unknown>(`/backoffice/ndp-experience-campaigns/${encodeURIComponent(versionPublicId)}/archive`, { method: "POST", body }));
  },
  async listTiers() {
    return array(await httpClient.request<unknown>("/backoffice/membership-tiers")).map(decodeTier);
  },
  async getTierDraft(tierCode: PlatformTierCode) {
    return decodeTierVersion(await httpClient.request<unknown>(`/backoffice/membership-tiers/${tierCode}/draft`));
  },
  async saveTierDraft(tierCode: PlatformTierCode, body: {
    expectedVersion: number;
    expectedLockVersion: number;
    durationDays: number | null;
    monthlyValueNdp: number;
    annualBillingMonths: number;
    experienceMultiplier: number;
    description: string | null;
    theme: PlatformMembershipTheme;
    benefits: TierBenefitDraft[];
  }) {
    return decodeTierVersion(await httpClient.request<unknown>(`/backoffice/membership-tiers/${tierCode}/draft`, { method: "PUT", body }));
  },
  async publishTier(tierCode: PlatformTierCode, body: { expectedVersion: number; expectedLockVersion: number }) {
    return decodeTierVersion(await httpClient.request<unknown>(`/backoffice/membership-tiers/${tierCode}/publish`, { method: "POST", body }));
  },
  async listBenefits() {
    return array(await httpClient.request<unknown>("/backoffice/membership-benefits")).map(decodeBenefit);
  },
  async updateBenefit(benefitCode: PlatformBenefitCode, body: {
    isGloballyEnabled: boolean;
    sortOrder: number;
    nameTranslations: PlatformBenefitLocalizedText;
    descriptionTranslations: PlatformBenefitLocalizedText;
    expectedLockVersion: number;
  }) {
    return decodeBenefit(await httpClient.request<unknown>(`/backoffice/membership-benefits/${benefitCode}`, { method: "PATCH", body }));
  },
  changeMembership(userId: number, body: Record<string, unknown>) {
    return httpClient.request<unknown>(`/backoffice/users/${userId}/platform-membership`, { method: "POST", body });
  },
  async listExperienceEntries(userId: number, query: PageQuery = {}) {
    return decodePage(
      await httpClient.request<unknown>(`/backoffice/users/${userId}/experience-entries`, { query: pageQuery(query) }),
      decodeExperienceEntry
    );
  }
};
