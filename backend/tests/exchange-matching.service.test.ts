import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ExchangeMatchingService,
  type ExchangeMatchingRepositoryPort
} from "../src/services/exchange-matching.service";
import type {
  ExchangeMatchingRecord,
  ExchangeMatchingSelectionClaim
} from "../src/repositories/exchange-matching.repository";
import type { ExchangeMatchingPayload } from "../src/types/exchange-matching.types";
import type { SelectExchangeMatchBody } from "../src/validators/exchange-matching.validators";

const now = new Date("2026-09-01T01:00:00.000Z");
const access: AuthenticatedAccessContext = {
  userId: 7,
  email: "owner@needo.local",
  accessTokenJti: "matching-jti",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 17,
  currentPublicId: "C0000000017",
  currentIdentityType: "customer",
  currentIdentityScopeType: "user",
  currentIdentityScopeId: 7,
  roles: ["customer"],
  permissions: []
};

const participant = (claimId: number, technicianProfileId: number, quoteAmountJpy: number) => ({
  exchangeClaimId: claimId,
  provider: {
    publicId: `B${String(claimId).padStart(10, "0")}`,
    displayName: `Provider ${claimId}`,
    avatarUrl: null
  },
  shop: { id: 11, name: "Aoyama Care" },
  technician: {
    profileId: technicianProfileId,
    publicId: `S${String(technicianProfileId).padStart(10, "0")}`,
    displayName: `Technician ${technicianProfileId}`
  },
  service: { ref: "shop:501" as const, name: "ヘアセット", durationMinutes: 60 },
  scheduleSlotId: claimId + 1_000,
  quoteAmountJpy,
  currency: "JPY" as const,
  estimatedStartsAt: "2026-09-02T01:00:00.000Z",
  estimatedEndsAt: "2026-09-02T02:00:00.000Z",
  matchedAt: now.toISOString(),
  booking: null
});

const openPayload: ExchangeMatchingPayload = {
  exchangePostId: 41,
  status: "open",
  version: 3,
  effectiveTargetProviderCount: 2,
  effectiveBudgetMaxJpy: 30_000,
  selectedQuoteTotalJpy: 0,
  matchedAt: null,
  participants: [],
  quickBudgetDecision: null,
  viewer: { canSelect: true, canConfirmQuickBudget: false, canCreateBookings: false }
};

const matchingRecord: ExchangeMatchingRecord = {
  id: 51,
  exchangePostId: 41,
  ownerUserId: 7,
  ownerIdentityId: 17,
  postType: "demand",
  postStatus: "published",
  matchMode: "selective",
  expiresAt: new Date("2026-09-01T12:00:00.000Z"),
  status: "open",
  effectiveTargetProviderCount: 2,
  effectiveBudgetMaxJpy: 30_000,
  selectedQuoteTotalJpy: 0,
  version: 3,
  matchedAt: null,
  payload: openPayload
};

const quickBudgetPayload: ExchangeMatchingPayload = {
  ...openPayload,
  quickBudgetDecision: {
    action: "increase_to_selected_total",
    activeClaimCount: 2,
    selectedQuoteTotalJpy: 31_000,
    effectiveBudgetMaxJpy: 30_000,
    requiredBudgetMaxJpy: 31_000,
    requiredBudgetIncreaseJpy: 1_000
  },
  viewer: { canSelect: false, canConfirmQuickBudget: true, canCreateBookings: false }
};

const claim = (
  id: number,
  technicianProfileId: number,
  quoteAmountJpy: number
): ExchangeMatchingSelectionClaim => ({
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
  currency: "JPY",
  status: "active",
  estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
  estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z")
});

const claims = [claim(301, 81, 15_000), claim(302, 82, 14_000)];
const selection = (
  selectedClaimIds: number[],
  overrides: Partial<SelectExchangeMatchBody> = {}
): SelectExchangeMatchBody => ({
  selectedClaimIds,
  expectedVersion: 3,
  budgetConfirmation: null,
  targetConfirmation: null,
  ...overrides
});
const matchedPayload: ExchangeMatchingPayload = {
  ...openPayload,
  status: "matched",
  version: 4,
  selectedQuoteTotalJpy: 29_000,
  matchedAt: now.toISOString(),
  participants: [participant(301, 81, 15_000), participant(302, 82, 14_000)],
  quickBudgetDecision: null,
  viewer: { canSelect: false, canConfirmQuickBudget: false, canCreateBookings: true }
};

const quickClaims = [claim(301, 81, 15_000), claim(302, 82, 16_000)];
const quickMatchingRecord: ExchangeMatchingRecord = {
  ...matchingRecord,
  matchMode: "quick",
  payload: quickBudgetPayload
};
const quickMatchedPayload: ExchangeMatchingPayload = {
  ...matchedPayload,
  version: 5,
  effectiveBudgetMaxJpy: 31_000,
  selectedQuoteTotalJpy: 31_000
};

const createRepository = (
  overrides: Partial<ExchangeMatchingRepositoryPort> = {}
): ExchangeMatchingRepositoryPort => {
  const repository: ExchangeMatchingRepositoryPort = {
    runInTransaction: jest.fn(async (handler) => handler(repository)),
    findForViewer: jest.fn(async () => matchingRecord),
    findIdempotentSelection: jest.fn(async () => null),
    findIdempotentQuickConfirmation: jest.fn(async () => null),
    lockMatching: jest.fn(async () => matchingRecord),
    lockActiveClaims: jest.fn(async () => claims),
    lockTechnicians: jest.fn(async () => true),
    hasParticipantConflict: jest.fn(async () => false),
    hasBookingConflict: jest.fn(async () => false),
    completeMatch: jest.fn(async () => matchedPayload),
    ...overrides
  };
  return repository;
};

describe("ExchangeMatchingService", () => {
  it("reads only an owner or selected participant projection", async () => {
    const repository = createRepository();
    const service = new ExchangeMatchingService(repository, () => now);
    await expect(service.getMatching(access, 41)).resolves.toEqual(openPayload);
    expect(repository.findForViewer).toHaveBeenCalledWith(41, 17);

    const hidden = createRepository({ findForViewer: jest.fn(async () => null) });
    await expect(
      new ExchangeMatchingService(hidden, () => now).getMatching(access, 41)
    ).rejects.toMatchObject({ code: 40423 });
  });

  it("returns the repository-owned exact Quick budget decision unchanged", async () => {
    const repository = createRepository({
      findForViewer: jest.fn(async () => ({
        ...matchingRecord,
        matchMode: "quick" as const,
        payload: quickBudgetPayload
      }))
    });

    await expect(
      new ExchangeMatchingService(repository, () => now).getMatching(access, 41)
    ).resolves.toEqual(quickBudgetPayload);
  });

  it("confirms the exact Quick total and matches every active claim", async () => {
    const repository = createRepository({
      lockMatching: jest.fn(async () => quickMatchingRecord),
      lockActiveClaims: jest.fn(async () => quickClaims),
      completeMatch: jest.fn(async () => quickMatchedPayload)
    });
    const service = new ExchangeMatchingService(repository, () => now);

    await expect(
      service.confirmQuickBudget(
        access,
        41,
        {
          expectedVersion: 3,
          budgetConfirmation: {
            action: "increase_to_selected_total",
            confirmedBudgetMaxJpy: 31_000
          }
        },
        "matching-quick-budget-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toEqual(quickMatchedPayload);
    expect(repository.completeMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedClaimIds: [301, 302],
        unselectedClaimIds: [],
        selectedQuoteTotalJpy: 31_000,
        effectiveBudgetMaxJpyAfter: 31_000,
        adjustments: [{ type: "budget_increased", before: 30_000, after: 31_000 }],
        versionBefore: 3,
        versionAfter: 5,
        actorUserId: 7,
        actorIdentityId: 17,
        viewerIdentityId: 17,
        matchEventType: "quick_matched",
        idempotencyKey: "matching-quick-budget-0001"
      })
    );
  });

  it.each([
    ["non-owner", { ...quickMatchingRecord, ownerIdentityId: 99 }, 3, 31_000, 40312],
    ["Selective mode", matchingRecord, 3, 31_000, 40992],
    ["non-open matching", { ...quickMatchingRecord, status: "matched" as const }, 3, 31_000, 40992],
    ["stale version", quickMatchingRecord, 2, 31_000, 40993],
    [
      "expired Request",
      { ...quickMatchingRecord, expiresAt: new Date("2026-08-31T23:59:59.000Z") },
      3,
      31_000,
      40992
    ]
  ])("rejects Quick confirmation for %s", async (_label, record, version, budget, code) => {
    const repository = createRepository({ lockMatching: jest.fn(async () => record) });
    await expect(
      new ExchangeMatchingService(repository, () => now).confirmQuickBudget(
        access,
        41,
        {
          expectedVersion: version,
          budgetConfirmation: {
            action: "increase_to_selected_total",
            confirmedBudgetMaxJpy: budget
          }
        },
        `matching-quick-reject-${code}`,
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code });
    expect(repository.completeMatch).not.toHaveBeenCalled();
  });

  it("requires target capacity, a real overage and the exact locked total", async () => {
    for (const [activeClaims, confirmedBudgetMaxJpy, code] of [
      [[quickClaims[0]!], 15_000, 40995],
      [[...quickClaims, claim(303, 83, 1_000)], 32_000, 40995],
      [claims, 29_000, 40992],
      [quickClaims, 30_999, 41001]
    ] as const) {
      const repository = createRepository({
        lockMatching: jest.fn(async () => quickMatchingRecord),
        lockActiveClaims: jest.fn(async () => [...activeClaims])
      });
      await expect(
        new ExchangeMatchingService(repository, () => now).confirmQuickBudget(
          access,
          41,
          {
            expectedVersion: 3,
            budgetConfirmation: {
              action: "increase_to_selected_total",
              confirmedBudgetMaxJpy
            }
          },
          `matching-quick-exact-${confirmedBudgetMaxJpy}`,
          { ip: "127.0.0.1", userAgent: "jest" }
        )
      ).rejects.toMatchObject({ code });
      expect(repository.completeMatch).not.toHaveBeenCalled();
    }
  });

  it("rejects Quick confirmation conflicts before the terminal mutation", async () => {
    for (const method of ["hasParticipantConflict", "hasBookingConflict"] as const) {
      const repository = createRepository({
        lockMatching: jest.fn(async () => quickMatchingRecord),
        lockActiveClaims: jest.fn(async () => quickClaims),
        [method]: jest.fn(async () => true)
      });
      await expect(
        new ExchangeMatchingService(repository, () => now).confirmQuickBudget(
          access,
          41,
          {
            expectedVersion: 3,
            budgetConfirmation: {
              action: "increase_to_selected_total",
              confirmedBudgetMaxJpy: 31_000
            }
          },
          `matching-quick-conflict-${method}`,
          { ip: "127.0.0.1", userAgent: "jest" }
        )
      ).rejects.toMatchObject({ code: 40997 });
      expect(repository.completeMatch).not.toHaveBeenCalled();
    }
  });

  it("matches the exact selected count and budget in one repository transaction", async () => {
    const repository = createRepository();
    const service = new ExchangeMatchingService(repository, () => now);

    await expect(
      service.selectMatching(access, 41, selection([302, 301]), "matching-select-key-0001", {
        ip: "127.0.0.1",
        userAgent: "jest"
      })
    ).resolves.toEqual(matchedPayload);

    expect(repository.lockMatching).toHaveBeenCalledWith(41);
    expect(repository.lockActiveClaims).toHaveBeenCalledWith(41);
    expect(repository.lockTechnicians).toHaveBeenCalledWith([81, 82]);
    expect(repository.completeMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        matchingId: 51,
        exchangePostId: 41,
        selectedClaimIds: [301, 302],
        unselectedClaims: [],
        unselectedClaimIds: [],
        selectedQuoteTotalJpy: 29_000,
        versionBefore: 3,
        versionAfter: 4,
        idempotencyKey: "matching-select-key-0001",
        actorUserId: 7,
        actorIdentityId: 17,
        viewerIdentityId: 17,
        matchEventType: "selective_matched"
      })
    );
  });

  it("returns a zero-write target preview before accepting the exact reduction", async () => {
    const repository = createRepository();
    const service = new ExchangeMatchingService(repository, () => now);

    await expect(
      service.selectMatching(access, 41, selection([301]), "matching-target-preview-0001", {
        ip: "127.0.0.1",
        userAgent: "jest"
      })
    ).rejects.toMatchObject({
      code: 40999,
      message: "error.exchange.match_target_confirmation_required",
      data: {
        currentVersion: 3,
        selectedCount: 1,
        selectedQuoteTotalJpy: 15_000,
        effectiveTargetProviderCount: 2,
        effectiveBudgetMaxJpy: 30_000,
        requiredTargetProviderCount: 1,
        requiredBudgetMaxJpy: null,
        requiredBudgetIncreaseJpy: 0,
        requiresTargetConfirmation: true,
        requiresBudgetConfirmation: false
      }
    });
    expect(repository.completeMatch).not.toHaveBeenCalled();

    await service.selectMatching(
      access,
      41,
      selection([301], {
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 1
        }
      }),
      "matching-target-confirm-0001",
      { ip: "127.0.0.1", userAgent: "jest" }
    );
    expect(repository.completeMatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveTargetProviderCountAfter: 1,
        effectiveBudgetMaxJpyAfter: 30_000,
        adjustments: [{ type: "target_reduced", before: 2, after: 1 }],
        versionBefore: 3,
        versionAfter: 5
      })
    );
  });

  it("returns a zero-write budget preview before accepting the exact increase", async () => {
    const overBudgetClaims = [claims[0]!, { ...claims[1]!, quoteAmountJpy: 16_000 }];
    const repository = createRepository({
      lockActiveClaims: jest.fn(async () => overBudgetClaims)
    });
    const service = new ExchangeMatchingService(repository, () => now);

    await expect(
      service.selectMatching(access, 41, selection([301, 302]), "matching-budget-preview-0001", {
        ip: "127.0.0.1",
        userAgent: "jest"
      })
    ).rejects.toMatchObject({
      code: 41001,
      message: "error.exchange.match_budget_confirmation_required",
      data: expect.objectContaining({
        selectedQuoteTotalJpy: 31_000,
        effectiveBudgetMaxJpy: 30_000,
        requiredBudgetMaxJpy: 31_000,
        requiredBudgetIncreaseJpy: 1_000,
        requiresBudgetConfirmation: true
      })
    });
    expect(repository.completeMatch).not.toHaveBeenCalled();

    await service.selectMatching(
      access,
      41,
      selection([301, 302], {
        budgetConfirmation: {
          action: "increase_to_selected_total",
          confirmedBudgetMaxJpy: 31_000
        }
      }),
      "matching-budget-confirm-0001",
      { ip: "127.0.0.1", userAgent: "jest" }
    );
    expect(repository.completeMatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveTargetProviderCountAfter: 2,
        effectiveBudgetMaxJpyAfter: 31_000,
        adjustments: [{ type: "budget_increased", before: 30_000, after: 31_000 }],
        versionBefore: 3,
        versionAfter: 5
      })
    );
  });

  it("requires both exact confirmations together and rejects inexact or unnecessary values", async () => {
    const expensiveSingleClaim = [{ ...claims[0]!, quoteAmountJpy: 31_000 }, claims[1]!];
    const repository = createRepository({
      lockActiveClaims: jest.fn(async () => expensiveSingleClaim)
    });
    const service = new ExchangeMatchingService(repository, () => now);
    const command = selection([301], {
      budgetConfirmation: {
        action: "increase_to_selected_total",
        confirmedBudgetMaxJpy: 31_000
      },
      targetConfirmation: {
        action: "reduce_to_selected_count",
        confirmedTargetProviderCount: 1
      }
    });

    await service.selectMatching(access, 41, command, "matching-combined-confirm-0001", {
      ip: "127.0.0.1",
      userAgent: "jest"
    });
    expect(repository.completeMatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveTargetProviderCountAfter: 1,
        effectiveBudgetMaxJpyAfter: 31_000,
        adjustments: [
          { type: "budget_increased", before: 30_000, after: 31_000 },
          { type: "target_reduced", before: 2, after: 1 }
        ],
        versionBefore: 3,
        versionAfter: 6
      })
    );

    for (const invalid of [
      selection([301], {
        budgetConfirmation: {
          action: "increase_to_selected_total",
          confirmedBudgetMaxJpy: 30_999
        },
        targetConfirmation: command.targetConfirmation
      }),
      selection([301], {
        budgetConfirmation: command.budgetConfirmation,
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 2
        }
      }),
      selection([301, 302], {
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 2
        }
      })
    ]) {
      const isolated = createRepository({
        lockActiveClaims: jest.fn(async () => expensiveSingleClaim)
      });
      await expect(
        new ExchangeMatchingService(isolated, () => now).selectMatching(
          access,
          41,
          invalid,
          "matching-invalid-confirm-0001",
          { ip: "127.0.0.1", userAgent: "jest" }
        )
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(isolated.completeMatch).not.toHaveBeenCalled();
    }

    const aboveTarget = createRepository({
      lockActiveClaims: jest.fn(async () => [...claims, claim(303, 83, 1_000)])
    });
    await expect(
      new ExchangeMatchingService(aboveTarget, () => now).selectMatching(
        access,
        41,
        selection([301, 302, 303]),
        "matching-above-target-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40995 });
    expect(aboveTarget.completeMatch).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong identity", { ownerIdentityId: 99 }, 40312],
    ["wrong mode", { matchMode: "quick" as const }, 40992],
    ["closed post", { postStatus: "withdrawn" as const }, 40992],
    ["expired", { expiresAt: now }, 40992],
    ["stale version", { version: 4 }, 40993]
  ])("rejects %s without completing", async (_label, patch, code) => {
    const repository = createRepository({
      lockMatching: jest.fn(async () => ({ ...matchingRecord, ...patch }))
    });
    const service = new ExchangeMatchingService(repository, () => now);
    await expect(
      service.selectMatching(access, 41, selection([301, 302]), "matching-select-key-0001", {
        ip: "127.0.0.1",
        userAgent: "jest"
      })
    ).rejects.toMatchObject({ code });
    expect(repository.completeMatch).not.toHaveBeenCalled();
  });

  it("rejects an inactive claim set and duplicate technician", async () => {
    const missing = createRepository({ lockActiveClaims: jest.fn(async () => [claims[0]!]) });
    await expect(
      new ExchangeMatchingService(missing, () => now).selectMatching(
        access,
        41,
        selection([301, 302]),
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40994 });

    const duplicateTechnician = createRepository({
      lockActiveClaims: jest.fn(async () => [
        claims[0]!,
        { ...claims[1]!, technicianProfileId: 81 }
      ])
    });
    await expect(
      new ExchangeMatchingService(duplicateTechnician, () => now).selectMatching(
        access,
        41,
        selection([301, 302]),
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40994 });
  });

  it("rejects participant and booking overlaps before completing", async () => {
    for (const method of ["hasParticipantConflict", "hasBookingConflict"] as const) {
      const repository = createRepository({ [method]: jest.fn(async () => true) });
      await expect(
        new ExchangeMatchingService(repository, () => now).selectMatching(
          access,
          41,
          selection([301, 302]),
          "matching-select-key-0001",
          { ip: "127.0.0.1", userAgent: "jest" }
        )
      ).rejects.toMatchObject({ code: 40997 });
      expect(repository.completeMatch).not.toHaveBeenCalled();
    }
  });

  it("replays the same idempotency fingerprint and rejects changed commands", async () => {
    const initial = createRepository();
    const service = new ExchangeMatchingService(initial, () => now);
    await service.selectMatching(access, 41, selection([301, 302]), "matching-select-key-0001", {
      ip: "127.0.0.1",
      userAgent: "jest"
    });
    const input = (initial.completeMatch as jest.Mock).mock.calls[0]?.[0] as {
      payloadFingerprint: string;
    };
    const replay = createRepository({
      findIdempotentSelection: jest.fn(async () => ({
        payload: matchedPayload,
        payloadFingerprint: input.payloadFingerprint
      }))
    });
    await expect(
      new ExchangeMatchingService(replay, () => now).selectMatching(
        access,
        41,
        selection([302, 301]),
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toEqual(matchedPayload);
    expect(replay.lockMatching).not.toHaveBeenCalled();

    const changedConfirmation = createRepository({
      findIdempotentSelection: jest.fn(async () => ({
        payload: matchedPayload,
        payloadFingerprint: input.payloadFingerprint
      }))
    });
    await expect(
      new ExchangeMatchingService(changedConfirmation, () => now).selectMatching(
        access,
        41,
        selection([301, 302], {
          budgetConfirmation: {
            action: "increase_to_selected_total",
            confirmedBudgetMaxJpy: 30_000
          }
        }),
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40998 });
    expect(changedConfirmation.lockMatching).not.toHaveBeenCalled();

    const conflict = createRepository({
      findIdempotentSelection: jest.fn(async () => ({
        payload: matchedPayload,
        payloadFingerprint: "f".repeat(64)
      }))
    });
    await expect(
      new ExchangeMatchingService(conflict, () => now).selectMatching(
        access,
        41,
        selection([301, 302]),
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40998 });
  });

  it("replays only the identical Quick budget command", async () => {
    const initial = createRepository({
      lockMatching: jest.fn(async () => quickMatchingRecord),
      lockActiveClaims: jest.fn(async () => quickClaims),
      completeMatch: jest.fn(async () => quickMatchedPayload)
    });
    const body = {
      expectedVersion: 3,
      budgetConfirmation: {
        action: "increase_to_selected_total" as const,
        confirmedBudgetMaxJpy: 31_000
      }
    };
    await new ExchangeMatchingService(initial, () => now).confirmQuickBudget(
      access,
      41,
      body,
      "matching-quick-replay-0001",
      { ip: "127.0.0.1", userAgent: "jest" }
    );
    const completedInput = (initial.completeMatch as jest.Mock).mock.calls[0]?.[0] as {
      payloadFingerprint: string;
    };
    const replay = createRepository({
      findIdempotentQuickConfirmation: jest.fn(async () => ({
        payload: quickMatchedPayload,
        payloadFingerprint: completedInput.payloadFingerprint
      }))
    });
    await expect(
      new ExchangeMatchingService(replay, () => now).confirmQuickBudget(
        access,
        41,
        body,
        "matching-quick-replay-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toEqual(quickMatchedPayload);
    expect(replay.lockMatching).not.toHaveBeenCalled();

    await expect(
      new ExchangeMatchingService(replay, () => now).confirmQuickBudget(
        access,
        41,
        {
          ...body,
          budgetConfirmation: { ...body.budgetConfirmation, confirmedBudgetMaxJpy: 32_000 }
        },
        "matching-quick-replay-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40998 });
  });
});
