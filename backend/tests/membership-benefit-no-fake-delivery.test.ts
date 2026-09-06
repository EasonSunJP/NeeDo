import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  PlatformMembershipRepositoryPort,
  ResolvedPlatformMembership
} from "../src/repositories/platform-membership.repository";
import { PlatformMembershipService } from "../src/services/platform-membership.service";

const localized = {
  zh: "权益",
  "zh-Hant": "權益",
  ja: "特典",
  en: "Benefit",
  ko: "혜택"
};

describe("membership benefit delivery boundary", () => {
  it("projects unavailable benefits without any membership or delivery mutation", async () => {
    const membership: ResolvedPlatformMembership = {
      tierCode: "gold",
      tierVersionPublicId: "gold-v1",
      multiplier: 5,
      expiresAt: null,
      benefits: [],
      benefitCatalog: ["support_service", "exclusive_discount", "member_day", "birthday_gift", "traceless_recall"].map(
        (code) => ({
          code: code as "support_service" | "exclusive_discount" | "member_day" | "birthday_gift" | "traceless_recall",
          configuredEnabled: true,
          globallyEnabled: true,
          configuration: {},
          nameTranslations: localized,
          descriptionTranslations: localized
        })
      ),
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
    };
    const repository = {
      listTiersForAdministration: jest.fn(),
      listBenefitsForAdministration: jest.fn(),
      hasActiveCustomerProfile: jest.fn(async () => true),
      hasVerifiedEkycAt: jest.fn(),
      findActiveEntitlementAt: jest.fn(async () => membership),
      findPublishedTierAt: jest.fn(),
      findTierDraft: jest.fn(),
      saveTierDraftWithAudit: jest.fn(),
      publishTierDraftWithAudit: jest.fn(),
      changeEntitlementWithAudit: jest.fn(),
      updateBenefitWithAudit: jest.fn()
    } as unknown as jest.Mocked<PlatformMembershipRepositoryPort>;

    const result = await new PlatformMembershipService(repository).getMyMembershipBenefits(
      { userId: 91 } as never,
      "en"
    );

    expect(result.list).toHaveLength(5);
    expect(result.list.filter((benefit) => benefit.code !== "traceless_recall")
      .every((benefit) => benefit.deliveryCapability === "unavailable")).toBe(true);
    expect(result.list.find((benefit) => benefit.code === "traceless_recall")?.deliveryCapability)
      .toBe("available");
    expect(repository.saveTierDraftWithAudit).not.toHaveBeenCalled();
    expect(repository.publishTierDraftWithAudit).not.toHaveBeenCalled();
    expect(repository.changeEntitlementWithAudit).not.toHaveBeenCalled();
    expect(repository.updateBenefitWithAudit).not.toHaveBeenCalled();
  });

  it("keeps the capability registry free of synthetic delivery entities", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/services/membership-benefit-capability.service.ts"),
      "utf8"
    );
    for (const forbidden of [
      "targetUserId",
      "serviceUserId",
      "conversationId",
      "contactId",
      "messageId",
      "couponId",
      "notificationId"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
