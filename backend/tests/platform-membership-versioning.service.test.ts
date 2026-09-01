import type { PlatformMembershipRepositoryPort } from "../src/repositories/platform-membership.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  PlatformMembershipService,
  type PlatformMembershipTierDraftInput
} from "../src/services/platform-membership.service";

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
const benefits: PlatformMembershipTierDraftInput["benefits"] = [
  {
    code: "ndp_experience",
    isEnabled: true,
    configuration: { extraThresholdNdp: null, extraAwardExpUnits: null }
  },
  { code: "member_sign_in", isEnabled: true, configuration: {} },
  { code: "priority_request", isEnabled: false, configuration: {} },
  { code: "support_service", isEnabled: false, configuration: {} },
  { code: "exclusive_discount", isEnabled: false, configuration: {} },
  { code: "member_day", isEnabled: false, configuration: {} },
  { code: "birthday_gift", isEnabled: false, configuration: {} }
];
const draft: PlatformMembershipTierDraftInput = {
  expectedVersion: 1,
  expectedLockVersion: 1,
  durationDays: 30,
  monthlyValueNdp: 1_999,
  annualBillingMonths: 10,
  experienceMultiplier: 5,
  description: "Gold membership",
  theme,
  benefits
};
const persistedDraft = {
  tierCode: "gold" as const,
  tierVersionPublicId: "00000000-0000-4000-8000-000000000920",
  version: 2,
  status: "draft" as const,
  lockVersion: 1,
  durationDays: 30,
  monthlyValueNdp: 1_999,
  annualBillingMonths: 10,
  experienceMultiplier: 5,
  description: "Gold membership",
  effectiveFrom: now,
  effectiveTo: null,
  publishedAt: null,
  theme,
  benefits
};
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "admin@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "operations",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operations_admin"],
  permissions: ["backoffice:membership-tier:publish"]
};
const context = { ip: "127.0.0.1", userAgent: "jest" };
type SaveDraftArgument = Parameters<
  PlatformMembershipRepositoryPort["saveTierDraftWithAudit"]
>[0];
type PublishDraftArgument = Parameters<
  PlatformMembershipRepositoryPort["publishTierDraftWithAudit"]
>[0];

const repository = (
  overrides: Partial<jest.Mocked<PlatformMembershipRepositoryPort>> = {}
): jest.Mocked<PlatformMembershipRepositoryPort> => ({
  listTiersForAdministration: jest.fn(),
  listBenefitsForAdministration: jest.fn(),
  hasActiveCustomerProfile: jest.fn(),
  hasVerifiedEkycAt: jest.fn(),
  findActiveEntitlementAt: jest.fn(),
  findPublishedTierAt: jest.fn(),
  findTierDraft: jest.fn(async (tierCode) => {
    void tierCode;
    return persistedDraft;
  }),
  saveTierDraftWithAudit: jest.fn(async (input: SaveDraftArgument) => {
    void input;
    return { kind: "saved" as const, value: persistedDraft };
  }),
  publishTierDraftWithAudit: jest.fn(async (input: PublishDraftArgument) => {
    void input;
    return {
      kind: "published" as const,
      value: {
        ...persistedDraft,
        status: "published" as const,
        lockVersion: 2,
        publishedAt: now
      }
    };
  }),
  changeEntitlementWithAudit: jest.fn(),
  updateBenefitWithAudit: jest.fn(),
  ...overrides
});
const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    metadata: input.metadata
  }))
};

describe("PlatformMembershipService tier versioning", () => {
  it("normalizes and saves a fixed tier draft with audit metadata", async () => {
    const repo = repository();
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.saveTierDraft(actor, context, "gold", draft)).resolves.toMatchObject({
      tierCode: "gold",
      status: "draft",
      version: 2
    });
    expect(repo.saveTierDraftWithAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 9,
      tierCode: "gold",
      draft: expect.objectContaining({ benefits }),
      audit: expect.objectContaining({ action: "platform.membership_tier.draft_save" })
    }));
  });

  it("rejects an incomplete benefit catalog before persistence", async () => {
    const repo = repository();
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.saveTierDraft(actor, context, "gold", {
      ...draft,
      benefits: benefits.slice(0, 2)
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.saveTierDraftWithAudit).not.toHaveBeenCalled();
  });

  it("requires readable accent contrast before publishing", async () => {
    const repo = repository({
      findTierDraft: jest.fn(async (tierCode) => {
        void tierCode;
        return {
          ...persistedDraft,
          theme: { ...theme, detailAccentColor: "#302819" }
        };
      })
    });
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.publishTierVersion(actor, context, "gold", {
      expectedVersion: 2,
      expectedLockVersion: 1
    })).rejects.toMatchObject({
      message: "error.platform_membership.theme_contrast",
      statusCode: 400
    });
    expect(repo.publishTierDraftWithAudit).not.toHaveBeenCalled();
  });

  it("publishes the expected draft and surfaces optimistic conflicts", async () => {
    const repo = repository({
      publishTierDraftWithAudit: jest.fn(async (input: PublishDraftArgument) => {
        void input;
        return { kind: "version_conflict" as const };
      })
    });
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.publishTierVersion(actor, context, "gold", {
      expectedVersion: 2,
      expectedLockVersion: 1
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
