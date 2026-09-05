import {
  PlatformMembershipBenefitCode,
  PlatformMembershipTierCode,
  PlatformMembershipVersionStatus
} from "@prisma/client";
import { PlatformMembershipRepository } from "../src/repositories/platform-membership.repository";

const at = new Date("2026-09-01T10:00:00.000Z");
const version = {
  publicId: "00000000-0000-4000-8000-000000000901",
  experienceMultiplier: "5.0000",
  detailAccentColor: "#F4C967",
  detailSurfaceColor: "#302818",
  detailItemSurfaceColor: "#201A10",
  detailOuterBorderColor: "#A98645",
  detailItemBorderColor: "#66552F",
  detailAvatarBorderColor: "#D0A857",
  simpleTopColor: "#382C13",
  simpleBottomColor: "#241E12",
  tier: { code: PlatformMembershipTierCode.GOLD },
  benefits: [
    {
      id: 901,
      publicId: "00000000-0000-4000-8000-000000000911",
      isEnabled: true,
      configurationJson: { extraThresholdNdp: null, extraAwardExpUnits: null },
      benefit: {
        code: PlatformMembershipBenefitCode.NDP_EXPERIENCE,
        isGloballyEnabled: true,
        nameTranslations: {
          zh: "NDP消费经验",
          "zh-Hant": "NDP消費經驗",
          ja: "NDP消費経験値",
          en: "NDP experience",
          ko: "NDP 경험치"
        },
        descriptionTranslations: {
          zh: "NDP消费产生经验",
          "zh-Hant": "NDP消費產生經驗",
          ja: "NDP消費で経験値を獲得",
          en: "Earn experience from NDP spending",
          ko: "NDP 소비로 경험치 획득"
        }
      }
    }
  ]
};

describe("PlatformMembershipRepository", () => {
  it("queries a non-superseded entitlement covering the occurrence time", async () => {
    const findFirst = jest.fn(async () => ({
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      tierVersion: version
    }));
    const repository = new PlatformMembershipRepository({
      platformMembershipEntitlement: { findFirst },
      customerProfile: { count: jest.fn() },
      platformMembershipTierVersion: { findFirst: jest.fn() }
    } as never);

    await expect(repository.findActiveEntitlementAt(7, at)).resolves.toMatchObject({
      tierCode: "gold",
      tierVersionPublicId: version.publicId,
      multiplier: 5
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 7,
          deletedAt: null,
          startsAt: { lte: at },
          supersededAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
          tierVersion: expect.objectContaining({
            status: {
              in: [
                PlatformMembershipVersionStatus.PUBLISHED,
                PlatformMembershipVersionStatus.ARCHIVED
              ]
            }
          })
        })
      })
    );
  });

  it("resolves the published free version for fallback without an entitlement row", async () => {
    const findFirst = jest.fn(async () => ({
      ...version,
      experienceMultiplier: "1.0000",
      tier: { code: PlatformMembershipTierCode.FREE }
    }));
    const repository = new PlatformMembershipRepository({
      platformMembershipEntitlement: { findFirst: jest.fn() },
      customerProfile: { count: jest.fn() },
      platformMembershipTierVersion: { findFirst }
    } as never);

    await expect(repository.findPublishedTierAt("free", at)).resolves.toMatchObject({
      tierCode: "free",
      multiplier: 1,
      expiresAt: null
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PlatformMembershipVersionStatus.PUBLISHED,
          tier: { code: PlatformMembershipTierCode.FREE, deletedAt: null }
        })
      })
    );
  });
});
