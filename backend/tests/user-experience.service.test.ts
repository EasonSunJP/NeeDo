import type {
  UserExperienceAccountSnapshot,
  UserExperienceCalculatedEvent,
  UserExperienceRepositoryPort
} from "../src/domain/user-experience";
import type { PlatformMembershipBenefitCodeValue } from "../src/domain/platform-membership";
import { UserExperienceService } from "../src/services/user-experience.service";

const account: UserExperienceAccountSnapshot = {
  publicId: "experience-account-41",
  userId: 41,
  totalUnits: 0n,
  currentLevel: 1,
  lockVersion: 1
};

const repository = (): jest.Mocked<UserExperienceRepositoryPort> => ({
  findActiveAccount: jest.fn(async (userId: number) => {
    void userId;
    return account;
  }),
  listEntries: jest.fn(async (userId, input) => {
    void userId;
    void input;
    return { list: [], total: 0, page: 1, page_size: 20 };
  }),
  recordCalculatedEvent: jest.fn(async (event: UserExperienceCalculatedEvent) => ({
    status: "awarded" as const,
    account: {
      ...account,
      totalUnits: event.finalUnits,
      currentLevel: event.finalUnits >= 200_000_000n ? 100 : 1,
      lockVersion: 2
    },
    entry: {
      publicId: "experience-entry-1",
      ...event
    }
  })),
  recordNdpConsumptionEvent: jest.fn()
});

const membership = (
  multiplier = 1,
  benefitCodes: PlatformMembershipBenefitCodeValue[] = []
) => ({
  resolveMembershipAt: jest.fn(async (userId: number, occurredAt: Date) => {
    void userId;
    void occurredAt;
    return {
      tierCode: multiplier === 10 ? ("black_diamond" as const) : ("free" as const),
      tierVersionPublicId: "tier-version-1",
      multiplier,
      expiresAt: null,
      benefits: benefitCodes.map((code) => ({ code, configuration: {} })),
      theme: {
        detailAccentColor: "#00FF00",
        detailSurfaceColor: "#000000",
        detailItemSurfaceColor: "#111111",
        detailOuterBorderColor: "#222222",
        detailItemBorderColor: "#333333",
        detailAvatarBorderColor: "#444444",
        simpleTopColor: "#555555",
        simpleBottomColor: "#666666"
      }
    };
  })
});

describe("UserExperienceService", () => {
  it("summarizes nonlinear level progress with exact decimal EXP strings", async () => {
    const repo = repository();
    repo.findActiveAccount.mockResolvedValueOnce({
      ...account,
      totalUnits: 21_945_000n,
      currentLevel: 30
    });
    const service = new UserExperienceService(repo, membership());

    await expect(service.getSummary(41)).resolves.toEqual({
      level: 30,
      totalExp: "2194.5",
      currentLevelExp: "0.5",
      nextLevelExp: "138",
      progressBps: 36
    });
  });

  it("reports experience as not applicable without an active customer account", async () => {
    const repo = repository();
    repo.findActiveAccount.mockResolvedValueOnce(null);
    const service = new UserExperienceService(repo, membership());

    await expect(service.getSummary(52)).rejects.toMatchObject({
      statusCode: 422,
      message: "error.user_experience.not_applicable"
    });
  });

  it("applies campaign and membership BPS with integer floor then adds unmultiplied extras", async () => {
    const repo = repository();
    const service = new UserExperienceService(repo, membership(10));

    const result = await service.recordEvent({
      userId: 41,
      eventType: "service_completed",
      sourceType: "booking_order",
      sourcePublicId: "order-1",
      idempotencyKey: "service-completed:order-1",
      baseUnits: 10_001n,
      campaignFactorBps: 100_000,
      extraUnits: 7n,
      occurredAt: new Date("2026-09-01T00:00:00.000Z")
    });

    expect(result.status).toBe("awarded");
    expect(repo.recordCalculatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUnits: 10_001n,
        campaignFactorBps: 100_000,
        membershipMultiplierBps: 100_000,
        extraUnits: 7n,
        finalUnits: 1_000_107n,
        membershipTierCode: "black_diamond",
        membershipTierVersionId: "tier-version-1"
      })
    );
  });

  it.each([
    [1, 10_000],
    [2, 20_000],
    [5, 50_000],
    [10, 100_000]
  ])("snapshots the x%s membership multiplier", async (multiplier, expectedBps) => {
    const repo = repository();
    const service = new UserExperienceService(repo, membership(multiplier));
    await service.recordEvent({
      userId: 41,
      eventType: "social_post_liked",
      sourceType: "social_post_like",
      sourcePublicId: `like-${multiplier}`,
      idempotencyKey: `social-post-like:post-1:user-${multiplier}`,
      baseUnits: 10_000n,
      occurredAt: new Date("2026-09-01T00:00:00.000Z")
    });
    expect(repo.recordCalculatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipMultiplierBps: expectedBps,
        finalUnits: BigInt(expectedBps)
      })
    );
  });

  it("does not award a gated sign-in when the resolved benefit is disabled", async () => {
    const repo = repository();
    const service = new UserExperienceService(repo, membership(2));
    const result = await service.recordEvent({
      userId: 41,
      eventType: "member_sign_in",
      sourceType: "member_sign_in",
      sourcePublicId: "2026-09-01",
      idempotencyKey: "member-sign-in:u1:2026-09-01",
      baseUnits: 10_000n,
      requiredBenefit: "member_sign_in",
      occurredAt: new Date("2026-09-01T00:00:00.000Z")
    });
    expect(result).toEqual({ status: "ineligible", account });
    expect(repo.recordCalculatedEvent).not.toHaveBeenCalled();
  });

  it("does not resolve membership for a technician-only user", async () => {
    const repo = repository();
    repo.findActiveAccount.mockResolvedValueOnce(null);
    const membershipResolver = membership(10);
    const service = new UserExperienceService(repo, membershipResolver);
    await expect(
      service.recordEvent({
        userId: 52,
        eventType: "service_completed",
        sourceType: "booking_order",
        sourcePublicId: "order-2",
        idempotencyKey: "service-completed:order-2",
        baseUnits: 100_000n,
        occurredAt: new Date("2026-09-01T00:00:00.000Z")
      })
    ).resolves.toEqual({ status: "ineligible", account: null });
    expect(membershipResolver.resolveMembershipAt).not.toHaveBeenCalled();
  });

  it("returns the repository duplicate and keeps accumulated totals beyond Lv.100", async () => {
    const repo = repository();
    repo.recordCalculatedEvent.mockResolvedValueOnce({
      status: "duplicate",
      account: { ...account, totalUnits: 250_000_000n, currentLevel: 100 },
      entry: null
    });
    const service = new UserExperienceService(repo, membership(1));
    const result = await service.recordEvent({
      userId: 41,
      eventType: "service_completed",
      sourceType: "booking_order",
      sourcePublicId: "order-3",
      idempotencyKey: "service-completed:order-3",
      baseUnits: 100_000n,
      occurredAt: new Date("2026-09-01T00:00:00.000Z")
    });
    expect(result).toMatchObject({
      status: "duplicate",
      account: { totalUnits: 250_000_000n, currentLevel: 100 }
    });
  });
});
