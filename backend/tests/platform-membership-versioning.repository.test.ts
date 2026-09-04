import {
  PlatformMembershipBenefitCode,
  PlatformMembershipTierCode,
  PlatformMembershipVersionStatus
} from "@prisma/client";
import {
  PlatformMembershipRepository,
  type PlatformMembershipTierDraftPersistenceInput
} from "../src/repositories/platform-membership.repository";

const now = new Date("2026-09-01T12:00:00.000Z");
const theme = {
  detailAccentColor: "#F4C967",
  detailSurfaceColor: "#302818",
  detailItemSurfaceColor: "#201A10",
  detailOuterBorderColor: "#A98645",
  detailItemBorderColor: "#66552F",
  detailAvatarBorderColor: "#D0A857",
  simpleTopColor: "#382C13",
  simpleBottomColor: "#241E12"
};
const benefitCodes = [
  PlatformMembershipBenefitCode.NDP_EXPERIENCE,
  PlatformMembershipBenefitCode.MEMBER_SIGN_IN,
  PlatformMembershipBenefitCode.PRIORITY_REQUEST,
  PlatformMembershipBenefitCode.SUPPORT_SERVICE,
  PlatformMembershipBenefitCode.EXCLUSIVE_DISCOUNT,
  PlatformMembershipBenefitCode.MEMBER_DAY,
  PlatformMembershipBenefitCode.BIRTHDAY_GIFT
];
const publicBenefitCodes = [
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift"
] as const;
const draft: PlatformMembershipTierDraftPersistenceInput = {
  expectedVersion: 1,
  expectedLockVersion: 1,
  durationDays: 30,
  monthlyValueNdp: 1_999,
  annualBillingMonths: 10,
  experienceMultiplier: 5,
  description: "Gold membership",
  theme,
  benefits: publicBenefitCodes.map((code) => ({
    code,
    isEnabled: code === "ndp_experience" || code === "member_sign_in",
    configuration:
      code === "ndp_experience" ? { extraThresholdNdp: null, extraAwardExpUnits: null } : {}
  }))
};

const administrationRecord = (status: PlatformMembershipVersionStatus) => ({
  publicId: "00000000-0000-4000-8000-000000000920",
  version: 2,
  status,
  lockVersion: status === PlatformMembershipVersionStatus.DRAFT ? 1 : 2,
  durationDays: 30,
  monthlyValueNdp: 1_999,
  annualBillingMonths: 10,
  experienceMultiplier: "5.0000",
  description: "Gold membership",
  effectiveFrom: now,
  effectiveTo: null,
  publishedAt: status === PlatformMembershipVersionStatus.PUBLISHED ? now : null,
  ...theme,
  tier: { code: PlatformMembershipTierCode.GOLD },
  benefits: benefitCodes.map((code) => ({
    isEnabled:
      code === PlatformMembershipBenefitCode.NDP_EXPERIENCE ||
      code === PlatformMembershipBenefitCode.MEMBER_SIGN_IN,
    configurationJson:
      code === PlatformMembershipBenefitCode.NDP_EXPERIENCE
        ? { extraThresholdNdp: null, extraAwardExpUnits: null }
        : {},
    benefit: { code }
  }))
});

describe("PlatformMembershipRepository tier versioning", () => {
  it("creates a new draft version with all seven benefits and audit in one transaction", async () => {
    const tierVersionCreate = jest.fn(async () => ({ id: 22, version: 2 }));
    const tierBenefitCreate = jest.fn(async () => ({}));
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      platformMembershipTier: {
        findFirst: jest.fn(async () => ({ id: 3, publicId: "tier-gold" }))
      },
      platformMembershipTierVersion: {
        findFirst: jest.fn(async () => ({
          id: 11,
          version: 1,
          status: PlatformMembershipVersionStatus.PUBLISHED,
          lockVersion: 1
        })),
        create: tierVersionCreate,
        updateMany: jest.fn()
      },
      platformMembershipBenefit: {
        findMany: jest.fn(async () => benefitCodes.map((code, index) => ({ id: index + 1, code })))
      },
      platformMembershipTierBenefit: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: tierBenefitCreate
      },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction)
      ),
      platformMembershipTierVersion: {
        findFirst: jest.fn(async () => administrationRecord(PlatformMembershipVersionStatus.DRAFT))
      }
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.saveTierDraftWithAudit({
        actorId: 9,
        tierCode: "gold",
        draft,
        audit: { actorId: 9, action: "save", targetType: "tier" }
      })
    ).resolves.toMatchObject({ kind: "saved", value: { version: 2, status: "draft" } });
    expect(tierVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tierId: 3,
          version: 2,
          status: PlatformMembershipVersionStatus.DRAFT,
          monthlyValueNdp: 1_999,
          experienceMultiplier: 5
        })
      })
    );
    expect(tierBenefitCreate).toHaveBeenCalledTimes(7);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("archives the previous publication and publishes the expected draft atomically", async () => {
    const tierVersionUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      platformMembershipTier: {
        findFirst: jest.fn(async () => ({ id: 3, publicId: "tier-gold" }))
      },
      platformMembershipTierVersion: {
        findFirst: jest.fn(async () => ({
          id: 22,
          publicId: "tier-version-gold-2",
          version: 2,
          lockVersion: 1
        })),
        updateMany: tierVersionUpdateMany
      },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction)
      ),
      platformMembershipTierVersion: {
        findFirst: jest.fn(async () =>
          administrationRecord(PlatformMembershipVersionStatus.PUBLISHED)
        )
      }
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.publishTierDraftWithAudit({
        actorId: 9,
        tierCode: "gold",
        expectedVersion: 2,
        expectedLockVersion: 1,
        audit: { actorId: 9, action: "publish", targetType: "tier_version" }
      })
    ).resolves.toMatchObject({ kind: "published", value: { status: "published" } });
    expect(tierVersionUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PlatformMembershipVersionStatus.PUBLISHED,
          publishedAt: now,
          publishedById: 9
        })
      })
    );
    expect(tierVersionUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PlatformMembershipVersionStatus.ARCHIVED,
          effectiveTo: now
        })
      })
    );
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("does not archive the current publication when the draft lock is stale", async () => {
    const tierVersionUpdateMany = jest.fn(async () => ({ count: 0 }));
    const auditCreate = jest.fn();
    const transaction = {
      platformMembershipTier: {
        findFirst: jest.fn(async () => ({ id: 3, publicId: "tier-gold" }))
      },
      platformMembershipTierVersion: {
        findFirst: jest.fn(async () => ({
          id: 22,
          publicId: "tier-version-gold-2",
          version: 2,
          lockVersion: 1
        })),
        updateMany: tierVersionUpdateMany
      },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.publishTierDraftWithAudit({
        actorId: 9,
        tierCode: "gold",
        expectedVersion: 2,
        expectedLockVersion: 1,
        audit: { actorId: 9, action: "publish", targetType: "tier_version" }
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(tierVersionUpdateMany).toHaveBeenCalledTimes(1);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("maps concurrent draft creation uniqueness to a version conflict", async () => {
    const client = {
      $transaction: jest.fn(async () => {
        throw { code: "P2002" };
      })
    };
    const repository = new PlatformMembershipRepository(client as never, () => now);

    await expect(
      repository.saveTierDraftWithAudit({
        actorId: 9,
        tierCode: "gold",
        draft,
        audit: { actorId: 9, action: "save", targetType: "tier" }
      })
    ).resolves.toEqual({ kind: "version_conflict" });
  });
});
