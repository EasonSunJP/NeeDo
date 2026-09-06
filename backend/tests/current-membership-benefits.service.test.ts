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
  free = membership("free"),
  hasActiveCustomerProfile = true
): jest.Mocked<PlatformMembershipRepositoryPort> => ({
  listTiersForAdministration: jest.fn(),
  listBenefitsForAdministration: jest.fn(),
  hasActiveCustomerProfile: jest.fn(async (userId: number) => {
    void userId;
    return hasActiveCustomerProfile;
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
    void occurredAt;
    return tierCode === "free" ? free : current;
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
      deliveryCapability: "available",
      effective: true,
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

  it.each([
    [true, true, "available", true],
    [false, true, "available", false],
    [true, false, "available", false],
    [true, true, "unavailable", false]
  ] as const)(
    "resolves traceless recall only when tier, global, and delivery switches are all effective",
    async (configuredEnabled, globallyEnabled, capability, expected) => {
      const resolved = membership("gold");
      const traceless = resolved.benefitCatalog!.find((item) => item.code === "traceless_recall")!;
      traceless.configuredEnabled = configuredEnabled;
      traceless.globallyEnabled = globallyEnabled;
      const service = new PlatformMembershipService(
        repository(resolved),
        undefined,
        () => now,
        undefined,
        new MembershipBenefitCapabilityService({ traceless_recall: { capability } })
      );

      await expect(service.hasEffectiveBenefitAt(41, "traceless_recall", now)).resolves.toBe(expected);
    }
  );

  it("returns standard-only eligibility for a legitimate non-customer without resolving membership", async () => {
    const repo = repository(membership("gold"), membership("free"), false);
    const service = new PlatformMembershipService(repo, undefined, () => now);

    await expect(service.hasEffectiveBenefitAt(41, "traceless_recall", now)).resolves.toBe(false);
    expect(repo.findActiveEntitlementAt).not.toHaveBeenCalled();
    expect(repo.findPublishedTierAt).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "uses the published v2 recall switch (%s) for an entitlement bound to archived v1",
    async (enabled) => {
      const archived = membership("gold");
      archived.benefitCatalog!.find((item) => item.code === "traceless_recall")!.configuredEnabled = !enabled;
      const published = membership("gold");
      published.tierVersionPublicId = "gold-v2";
      published.benefitCatalog!.find((item) => item.code === "traceless_recall")!.configuredEnabled = enabled;
      const repo = repository(archived);
      repo.findPublishedTierAt.mockResolvedValue(published);
      const service = new PlatformMembershipService(repo, undefined, () => now);

      await expect(service.hasEffectiveBenefitAt(41, "traceless_recall", now)).resolves.toBe(enabled);
      expect(repo.findPublishedTierAt).toHaveBeenCalledWith("gold", now);
      await expect(service.resolveMembershipAt(41, now)).resolves.toMatchObject({
        tierVersionPublicId: "gold-v1",
        multiplier: archived.multiplier,
        theme: archived.theme
      });
    }
  );

  it("fails with a stable internal error when the effective tier has no published version", async () => {
    const repo = repository(membership("gold"));
    repo.findPublishedTierAt.mockResolvedValue(null);
    const service = new PlatformMembershipService(repo, undefined, () => now);

    await expect(service.hasEffectiveBenefitAt(41, "traceless_recall", now)).rejects.toMatchObject({
      message: "error.platform_membership.benefit_catalog_unavailable",
      statusCode: 500
    });
  });

  it.each([
    ["benefit catalog is absent", (resolved: ResolvedPlatformMembership) => {
      delete resolved.benefitCatalog;
    }],
    ["traceless recall entry is absent", (resolved: ResolvedPlatformMembership) => {
      resolved.benefitCatalog = resolved.benefitCatalog!.filter(
        (item) => item.code !== "traceless_recall"
      );
    }]
  ] as const)("fails closed with a stable internal error when %s", async (_scenario, mutate) => {
    const resolved = membership("gold");
    mutate(resolved);
    const service = new PlatformMembershipService(repository(resolved), undefined, () => now);

    await expect(service.hasEffectiveBenefitAt(41, "traceless_recall", now)).rejects.toMatchObject({
      message: "error.platform_membership.benefit_catalog_unavailable",
      statusCode: 500
    });
  });
});
