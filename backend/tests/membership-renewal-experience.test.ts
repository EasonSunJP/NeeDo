import type {
  UserExperienceCalculatedEvent,
  UserExperienceRepositoryPort
} from "../src/domain/user-experience";
import type { PlatformMembershipRepositoryPort } from "../src/repositories/platform-membership.repository";
import type { AuditLogService } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { PlatformMembershipService } from "../src/services/platform-membership.service";
import { UserExperienceService } from "../src/services/user-experience.service";

const now = new Date("2026-09-01T03:00:00.000Z");
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "ops@example.com",
  roles: ["operations"],
  permissions: ["backoffice:user-membership:write"],
  currentIdentityType: "operations" as const,
  currentIdentityScopeType: "platform" as const,
  currentIdentityScopeId: null,
  accessTokenJti: "jti-membership",
  accessTokenExpiresAt: Math.floor(new Date("2026-09-01T04:00:00.000Z").getTime() / 1000)
};
const context = { requestId: "req-membership", ip: "127.0.0.1", userAgent: "jest" };
const audit = {
  createInput: jest.fn(() => ({
    actorUserId: 9,
    action: "platform.membership_entitlement.renew",
    targetType: "PlatformMembershipEntitlement",
    targetId: null,
    requestId: "req-membership",
    ipAddress: "127.0.0.1",
    userAgent: "jest",
    metadata: null
  }))
} as unknown as Pick<AuditLogService, "createInput">;

type EntitlementChangeInput = Parameters<
  PlatformMembershipRepositoryPort["changeEntitlementWithAudit"]
>[0];

const experienceRepository = (): jest.Mocked<UserExperienceRepositoryPort> => ({
  findActiveAccount: jest.fn(async (userId: number) => {
    void userId;
    return {
      publicId: "account-41",
      userId: 41,
      totalUnits: 0n,
      currentLevel: 1,
      lockVersion: 1
    };
  }),
  listEntries: jest.fn(async (userId, input) => {
    void userId;
    void input;
    return { list: [], total: 0, page: 1, page_size: 20 };
  }),
  recordCalculatedEvent: jest.fn(async (event: UserExperienceCalculatedEvent) => ({
    status: "awarded" as const,
    account: {
      publicId: "account-41",
      userId: 41,
      totalUnits: event.finalUnits,
      currentLevel: 1,
      lockVersion: 2
    },
    entry: { publicId: "entry-membership", ...event }
  })),
  recordNdpConsumptionEvent: jest.fn(),
  recordNdpReversalEvent: jest.fn()
});

const membershipResolver = {
  resolveMembershipAt: jest.fn()
};
const policyResolver = {
  resolvePolicyAt: jest.fn(async () => ({
    versionPublicId: "policy-version-1",
    ndpPerBaseExp: 100,
    baseExpUnitsPerThreshold: 10_000
  }))
};
const campaignResolver = { resolveCampaignAt: jest.fn() };

const membershipRepository = (
  experienceValueNdp: number,
  multiplier: number,
  benefitEnabled = true
) => {
  const repository = {
    hasActiveCustomerProfile: jest.fn(async () => true),
    changeEntitlementWithAudit: jest.fn(async (input: EntitlementChangeInput) => {
      await input.onEntitlementCreated?.({
        transactionClient: { entitlementTransaction: true },
        userId: 41,
        entitlementId: 801,
        entitlementPublicId: "00000000-0000-4000-8000-000000000801",
        experienceValueNdp,
        tierCode: "black_diamond",
        tierVersionPublicId: "tier-version-black-3",
        multiplier,
        benefits: benefitEnabled
          ? [
            {
                code: "ndp_experience"
              }
            ]
          : [],
        occurredAt: now
      });
      return {
        kind: "changed" as const,
        value: {
          kind: "renew" as const,
          tierCode: "black_diamond" as const,
          tierVersionPublicId: "tier-version-black-3",
          entitlementPublicId: "00000000-0000-4000-8000-000000000801",
          startsAt: now,
          expiresAt: new Date("2026-10-01T03:00:00.000Z"),
          experienceValueNdp,
          idempotent: false
        }
      };
    })
  } as unknown as jest.Mocked<PlatformMembershipRepositoryPort>;
  return repository;
};

describe("Membership entitlement experience", () => {
  it.each([
    ["monthly silver value", 300, 2, 60_000n],
    ["annual gold value uses ten configured months", 19_990, 5, 9_995_000n],
    ["annual black value uses ten configured months", 49_990, 10, 49_990_000n]
  ])("awards %s once without campaign or extra bonus", async (_label, value, multiplier, expected) => {
    const expRepo = experienceRepository();
    const experienceService = new UserExperienceService(
      expRepo,
      membershipResolver,
      policyResolver,
      campaignResolver
    );
    const membershipService = new PlatformMembershipService(
      membershipRepository(value, multiplier),
      audit,
      () => now,
      experienceService
    );

    await membershipService.changeEntitlement(actor, context, 41, {
      kind: "renew",
      targetTierCode: "black_diamond",
      billingCycle: "annual",
      expectedCurrentLockVersion: 1,
      source: "offline_transfer",
      sourceReference: `renew-${value}`
    });

    expect(expRepo.recordCalculatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "membership_renewed",
        idempotencyKey: "membership-renewal:00000000-0000-4000-8000-000000000801",
        entitlementId: 801,
        ndpAmount: value,
        ndpPerBaseExp: 100,
        campaignFactorBps: 10_000,
        membershipMultiplierBps: multiplier * 10_000,
        extraUnits: 0n,
        finalUnits: expected,
        policyVersionId: "policy-version-1",
        campaignVersionId: null
      }),
      { transactionClient: { entitlementTransaction: true } }
    );
    expect(campaignResolver.resolveCampaignAt).not.toHaveBeenCalled();
  });

  it.each([
    ["zero-value downgrade", 0, true],
    ["disabled NDP benefit", 4_999, false]
  ])("does not award a %s", async (_label, value, benefitEnabled) => {
    const expRepo = experienceRepository();
    const experienceService = new UserExperienceService(
      expRepo,
      membershipResolver,
      policyResolver,
      campaignResolver
    );
    const membershipService = new PlatformMembershipService(
      membershipRepository(value, 10, benefitEnabled),
      audit,
      () => now,
      experienceService
    );
    await membershipService.changeEntitlement(actor, context, 41, {
      kind: "renew",
      targetTierCode: "black_diamond",
      billingCycle: "monthly",
      expectedCurrentLockVersion: 1,
      source: "internal",
      sourceReference: `no-award-${value}-${benefitEnabled}`
    });
    expect(expRepo.recordCalculatedEvent).not.toHaveBeenCalled();
  });
});
