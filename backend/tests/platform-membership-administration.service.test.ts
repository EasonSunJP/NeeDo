import type { PlatformMembershipRepositoryPort } from "../src/repositories/platform-membership.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { PlatformMembershipService } from "../src/services/platform-membership.service";

const now = new Date("2026-09-01T12:00:00.000Z");
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "admin@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1_000) + 900,
  currentIdentityType: "operations",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operations_admin"],
  permissions: ["backoffice:membership-benefit:write"]
};
const tierCodes = ["free", "silver", "gold", "black_diamond"] as const;
const benefitCodes = [
  "ndp_experience",
  "member_sign_in",
  "priority_request",
  "support_service",
  "exclusive_discount",
  "member_day",
  "birthday_gift"
] as const;
const nameTranslations = { zh: "权益", "zh-Hant": "權益", ja: "特典", en: "Benefit", ko: "혜택" };
const descriptionTranslations = { zh: "权益说明", "zh-Hant": "權益說明", ja: "特典説明", en: "Benefit description", ko: "혜택 설명" };
const tiers = tierCodes.map((tierCode, sortOrder) => ({
  tierCode,
  sortOrder,
  publishedVersion: null,
  draftVersion: null
}));
const benefits = benefitCodes.map((code, sortOrder) => ({
  code,
  sortOrder,
  isGloballyEnabled: true,
  nameTranslations,
  descriptionTranslations,
  lockVersion: 1
}));
type UpdateBenefitArgument = Parameters<
  PlatformMembershipRepositoryPort["updateBenefitWithAudit"]
>[0];

const repository = (
  overrides: Partial<jest.Mocked<PlatformMembershipRepositoryPort>> = {}
): jest.Mocked<PlatformMembershipRepositoryPort> => ({
  listTiersForAdministration: jest.fn(async () => tiers),
  listBenefitsForAdministration: jest.fn(async () => benefits),
  hasActiveCustomerProfile: jest.fn(),
  hasVerifiedEkycAt: jest.fn(),
  findActiveEntitlementAt: jest.fn(),
  findPublishedTierAt: jest.fn(),
  findTierDraft: jest.fn(),
  saveTierDraftWithAudit: jest.fn(),
  publishTierDraftWithAudit: jest.fn(),
  changeEntitlementWithAudit: jest.fn(),
  updateBenefitWithAudit: jest.fn(async (input: UpdateBenefitArgument) => {
    void input;
    return {
      kind: "updated" as const,
      value: { ...benefits[0], isGloballyEnabled: false, lockVersion: 2 }
    };
  }),
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

describe("PlatformMembershipService administration", () => {
  it("returns exactly the fixed tier and benefit catalogs in their invariant order", async () => {
    const service = new PlatformMembershipService(repository(), audit, () => now);

    await expect(service.listTiersForAdministration(actor)).resolves.toEqual(tiers);
    await expect(service.listBenefitsForAdministration(actor)).resolves.toEqual(benefits);
  });

  it("updates a global benefit with optimistic locking and an audit input", async () => {
    const repo = repository();
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.updateBenefit(
      actor,
      { ip: "127.0.0.1" },
      "ndp_experience",
      { isGloballyEnabled: false, sortOrder: 0, nameTranslations, descriptionTranslations, expectedLockVersion: 1 }
    )).resolves.toMatchObject({
      code: "ndp_experience",
      isGloballyEnabled: false,
      lockVersion: 2
    });
    expect(repo.updateBenefitWithAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 9,
      benefitCode: "ndp_experience",
      expectedLockVersion: 1,
      sortOrder: 0,
      nameTranslations,
      descriptionTranslations,
      audit: expect.objectContaining({ action: "platform.membership_benefit.update" })
    }));
  });

  it("surfaces a stale benefit lock as 409", async () => {
    const service = new PlatformMembershipService(repository({
      updateBenefitWithAudit: jest.fn(async (input: UpdateBenefitArgument) => {
        void input;
        return { kind: "version_conflict" as const };
      })
    }), audit, () => now);

    await expect(service.updateBenefit(
      actor,
      { ip: "127.0.0.1" },
      "ndp_experience",
      { isGloballyEnabled: false, sortOrder: 0, nameTranslations, descriptionTranslations, expectedLockVersion: 1 }
    )).rejects.toMatchObject({ statusCode: 409 });
  });
});
