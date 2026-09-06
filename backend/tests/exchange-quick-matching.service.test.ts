import type { ExchangeMatchingPayload } from "../src/types/exchange-matching.types";
import {
  ExchangeQuickMatchingService,
  type ExchangeQuickMatchingRepositoryPort
} from "../src/services/exchange-quick-matching.service";

const now = new Date("2026-09-01T00:00:00.000Z");
const startsAt = new Date("2026-09-02T01:00:00.000Z");
const endsAt = new Date("2026-09-02T02:00:00.000Z");

const claim = (id: number, technicianProfileId: number, quoteAmountJpy: number) => ({
  id,
  exchangePostId: 41,
  claimantUserId: id + 100,
  claimantIdentityId: id + 200,
  shopId: 11,
  technicianProfileId,
  serviceId: 501,
  technicianServiceId: null,
  scheduleSlotId: id + 1_000,
  quoteAmountJpy,
  serviceNameSnapshot: "ヘアセット",
  serviceDurationSnapshot: 60,
  currency: "JPY" as const,
  status: "active" as const,
  estimatedStartsAt: startsAt,
  estimatedEndsAt: endsAt
});

const matchedPayload: ExchangeMatchingPayload = {
  exchangePostId: 41,
  status: "matched",
  version: 5,
  effectiveTargetProviderCount: 2,
  effectiveBudgetMaxJpy: 30_000,
  selectedQuoteTotalJpy: 29_000,
  matchedAt: now.toISOString(),
  participants: [],
  quickBudgetDecision: null,
  viewer: { canSelect: false, canConfirmQuickBudget: false, canCreateBookings: true }
};

const createRepository = (
  activeClaims = [claim(301, 81, 15_000)],
  overrides: Partial<ExchangeQuickMatchingRepositoryPort> = {}
): ExchangeQuickMatchingRepositoryPort => ({
  lockActiveClaims: jest.fn(async () => activeClaims),
  lockTechnicians: jest.fn(async () => true),
  hasParticipantConflict: jest.fn(async () => false),
  hasBookingConflict: jest.fn(async () => false),
  notifyQuickBudgetDecisionRequired: jest.fn(async () => undefined),
  completeMatch: jest.fn(async () => matchedPayload),
  ...overrides
});

const input = {
  exchangePostId: 41,
  ownerUserId: 7,
  ownerIdentityId: 17,
  matching: {
    id: 51,
    version: 4,
    effectiveTargetProviderCount: 2,
    effectiveBudgetMaxJpy: 30_000
  },
  triggeringClaimId: 302
};

describe("ExchangeQuickMatchingService", () => {
  it("keeps a Quick Request open below target", async () => {
    const repository = createRepository();

    await expect(
      new ExchangeQuickMatchingService(() => now).attemptAfterClaim(repository, input)
    ).resolves.toEqual({ kind: "waiting" });
    expect(repository.completeMatch).not.toHaveBeenCalled();
    expect(repository.notifyQuickBudgetDecisionRequired).not.toHaveBeenCalled();
  });

  it("matches every locked active claim when target and budget are satisfied", async () => {
    const activeClaims = [claim(301, 81, 15_000), claim(302, 82, 14_000)];
    const repository = createRepository(activeClaims);

    await expect(
      new ExchangeQuickMatchingService(() => now).attemptAfterClaim(repository, input)
    ).resolves.toEqual({ kind: "matched", matching: matchedPayload });
    expect(repository.lockTechnicians).toHaveBeenCalledWith([81, 82]);
    expect(repository.completeMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        matchingId: 51,
        exchangePostId: 41,
        selectedClaims: activeClaims,
        selectedClaimIds: [301, 302],
        unselectedClaims: [],
        unselectedClaimIds: [],
        selectedQuoteTotalJpy: 29_000,
        versionBefore: 4,
        versionAfter: 5,
        actorUserId: null,
        actorIdentityId: null,
        viewerIdentityId: 17,
        matchEventType: "quick_matched",
        idempotencyKey: "quick-auto:claim:302"
      })
    );
  });

  it("keeps every target claim active and records one owner decision notification when over budget", async () => {
    const activeClaims = [claim(301, 81, 15_000), claim(302, 82, 16_000)];
    const repository = createRepository(activeClaims);

    await expect(
      new ExchangeQuickMatchingService(() => now).attemptAfterClaim(repository, input)
    ).resolves.toEqual({ kind: "budget_decision_required", selectedQuoteTotalJpy: 31_000 });
    expect(repository.notifyQuickBudgetDecisionRequired).toHaveBeenCalledTimes(1);
    expect(repository.notifyQuickBudgetDecisionRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        matchingId: 51,
        exchangePostId: 41,
        ownerUserId: 7,
        ownerIdentityId: 17,
        activeClaimCount: 2,
        effectiveBudgetMaxJpy: 30_000,
        requiredBudgetMaxJpy: 31_000,
        requiredBudgetIncreaseJpy: 1_000
      })
    );
    expect(repository.completeMatch).not.toHaveBeenCalled();
  });

  it("rejects the triggering claim when a locked participant conflict appears", async () => {
    const repository = createRepository(
      [claim(301, 81, 15_000), claim(302, 82, 14_000)],
      { hasParticipantConflict: jest.fn(async () => true) }
    );

    await expect(
      new ExchangeQuickMatchingService(() => now).attemptAfterClaim(repository, input)
    ).rejects.toMatchObject({ code: 40976 });
    expect(repository.completeMatch).not.toHaveBeenCalled();
  });

  it("rejects a corrupt above-target claim set without choosing a subset", async () => {
    const repository = createRepository([
      claim(301, 81, 10_000),
      claim(302, 82, 10_000),
      claim(303, 83, 10_000)
    ]);

    await expect(
      new ExchangeQuickMatchingService(() => now).attemptAfterClaim(repository, input)
    ).rejects.toMatchObject({ code: 40979 });
    expect(repository.completeMatch).not.toHaveBeenCalled();
  });
});
