import type { ResolvedPlatformMembership } from "../src/repositories/platform-membership.repository";
import type { PlatformMembershipRepositoryPort } from "../src/repositories/platform-membership.repository";
import { MembershipBenefitCapabilityService } from "../src/services/membership-benefit-capability.service";
import { PlatformMembershipService } from "../src/services/platform-membership.service";

const now = new Date("2026-09-01T10:00:00.000Z");

const translations = (label: string) => ({
  zh: `${label}-zh`,
  "zh-Hant": `${label}-zh-Hant`,
  ja: `${label}-ja`,
  en: `${label}-en`,
  ko: `${label}-ko`
});

const membership = (tierCode: "free" | "gold"): ResolvedPlatformMembership => ({
  tierCode,
  tierVersionPublicId: `${tierCode}-v1`,
  multiplier: tierCode === "gold" ? 5 : 1,
  expiresAt: null,
  benefits: [{ code: "ndp_experience", configuration: {} }],
  benefitCatalog: [
    {
      code: "ndp_experience",
      configuredEnabled: true,
      globallyEnabled: true,
      configuration: {},
      nameTranslations: translations("ndp"),
      descriptionTranslations: translations("ndp-description")
    },
    {
      code: "support_service",
      configuredEnabled: true,
      globallyEnabled: true,
      configuration: {},
      nameTranslations: translations("support"),
      descriptionTranslations: translations("support-description")
    },
    {
      code: "birthday_gift",
      configuredEnabled: true,
      globallyEnabled: false,
      configuration: {},
      nameTranslations: translations("birthday"),
      descriptionTranslations: translations("birthday-description")
    },
    {
      code: "traceless_recall",
      configuredEnabled: true,
      globallyEnabled: true,
      configuration: {},
      nameTranslations: translations("traceless"),
      descriptionTranslations: translations("traceless-description")
    }
  ],
  theme: {
    detailAccentColor: "#A7FF33",
    detailSurfaceColor: "#102731",
    detailSurfaceMiddleColor: "#183A32",
    detailSurfaceBottomColor: "#24314B",
    detailItemSurfaceColor: "#0B1820",
    detailOuterBorderColor: "#577A39",
    detailItemBorderColor: "#34514A",
    detailAvatarBorderColor: "#729548",
    simpleTopColor: "#0A2619",
    simpleBottomColor: "#102631"
  }
});

const repository = (
  current: ResolvedPlatformMembership | null,
  free = membership("free")
): jest.Mocked<PlatformMembershipRepositoryPort> => ({
  listTiersForAdministration: jest.fn(),
  listBenefitsForAdministration: jest.fn(),
  hasActiveCustomerProfile: jest.fn(async (userId: number) => {
    void userId;
    return true;
  }),
  hasVerifiedEkycAt: jest.fn(async (userId: number, occurredAt: Date) => {
    void userId;
    void occurredAt;
    return false;
  }),
  findActiveEntitlementAt: jest.fn(async (userId: number, occurredAt: Date) => {
    void userId;
    void occurredAt;
    return current;
  }),
  findPublishedTierAt: jest.fn(async (tierCode, occurredAt: Date) => {
    void tierCode;
    void occurredAt;
    return free;
  }),
  findTierDraft: jest.fn(),
  saveTierDraftWithAudit: jest.fn(),
  publishTierDraftWithAudit: jest.fn(),
  changeEntitlementWithAudit: jest.fn(),
  updateBenefitWithAudit: jest.fn()
});

describe("current membership benefits", () => {
  it("separates configuration, global policy and real delivery capability", async () => {
    const service = new PlatformMembershipService(
      repository(membership("gold")),
      undefined,
      () => now,
      undefined,
      new MembershipBenefitCapabilityService()
    );

    const result = await service.getMyMembershipBenefits({ userId: 41 } as never, "ja");

    expect(result.tierCode).toBe("gold");
    expect(result.list.find((item) => item.code === "ndp_experience")).toMatchObject({
      configuredEnabled: true,
      globallyEnabled: true,
      deliveryCapability: "available",
      effective: true,
      name: "ndp-ja"
    });
    expect(result.list.find((item) => item.code === "support_service")).toMatchObject({
      configuredEnabled: true,
      globallyEnabled: true,
      deliveryCapability: "unavailable",
      effective: false,
      name: "support-ja"
    });
    expect(result.list.find((item) => item.code === "birthday_gift")).toMatchObject({
      configuredEnabled: true,
      globallyEnabled: false,
      deliveryCapability: "unavailable",
      effective: false
    });
    expect(result.list.find((item) => item.code === "traceless_recall")).toMatchObject({
      configuredEnabled: true,
      globallyEnabled: true,
      deliveryCapability: "unavailable",
      effective: false,
      name: "traceless-ja",
      description: "traceless-description-ja"
    });
    expect(JSON.stringify(result)).not.toMatch(/targetUserId|conversationId|couponId/);
  });

  it("falls back to the current free tier after a paid entitlement expires", async () => {
    const repo = repository(null);
    const service = new PlatformMembershipService(repo, undefined, () => now);

    await expect(
      service.getMyMembershipBenefits({ userId: 42 } as never, "en")
    ).resolves.toMatchObject({ tierCode: "free" });
    expect(repo.findPublishedTierAt).toHaveBeenCalledWith("free", now);
  });
});
