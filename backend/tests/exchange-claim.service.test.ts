import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ExchangeClaimService,
  type ExchangeClaimRepositoryPort
} from "../src/services/exchange-claim.service";
import type { ExchangeActorRecord } from "../src/services/exchange.service";
import type { ExchangeClaimPayload } from "../src/types/exchange-claim.types";
import type { ExchangeClaimRequestRecord } from "../src/repositories/exchange-claim.repository";

const now = new Date("2026-09-01T00:00:00.000Z");
const serviceStartsAt = new Date("2026-09-02T01:00:00.000Z");
const serviceEndsAt = new Date("2026-09-02T02:00:00.000Z");

const merchantAccess: AuthenticatedAccessContext = {
  userId: 7,
  email: "merchant@needo.local",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 17,
  currentPublicId: "B0000000017",
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "merchant_account",
  currentIdentityScopeId: 27,
  selectedMerchantShopId: 11,
  selectedMerchantShopPublicId: "SHOP0000011",
  roles: ["merchant_owner"],
  permissions: []
};

const technicianAccess: AuthenticatedAccessContext = {
  userId: 8,
  email: "technician@needo.local",
  accessTokenJti: "jti-tech",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 18,
  currentPublicId: "S0000000018",
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 81,
  roles: ["technician"],
  permissions: []
};

const merchantActor: ExchangeActorRecord = {
  userId: 7,
  identityId: 17,
  identityType: "merchant_owner",
  scopeType: "merchant_account",
  scopeId: 27,
  publicId: "B0000000017",
  displayName: "青山店",
  avatarUrl: null,
  isTestAccount: true,
  customerMembership: null,
  shopScope: null
};

const technicianActor: ExchangeActorRecord = {
  userId: 8,
  identityId: 18,
  identityType: "technician",
  scopeType: "technician_profile",
  scopeId: 81,
  publicId: "S0000000018",
  displayName: "山田 花子",
  avatarUrl: null,
  isTestAccount: true,
  customerMembership: null,
  shopScope: null
};

const claim: ExchangeClaimPayload = {
  id: 301,
  exchangePostId: 41,
  status: "active",
  provider: { publicId: merchantActor.publicId, displayName: "青山店", avatarUrl: null },
  shop: { id: 11, name: "Aoyama Care", publicId: "shop0000000011" },
  technician: {
    profileId: 81,
    publicId: technicianActor.publicId,
    displayName: "山田 花子"
  },
  service: { ref: "shop:501", publicId: "service0000000501", name: "ヘアセット", durationMinutes: 60 },
  source: "shop_dispatch",
  scheduleSlotId: 91,
  quoteAmountJpy: 15_000,
  currency: "JPY",
  message: null,
  estimatedStartsAt: serviceStartsAt.toISOString(),
  estimatedEndsAt: serviceEndsAt.toISOString(),
  createdAt: now.toISOString(),
  withdrawnAt: null,
  terminalAt: null
};

const request = {
  id: 41,
  authorUserId: 99,
  ownerIdentityId: 21,
  type: "demand" as const,
  status: "published" as const,
  serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
  serviceEndAt: new Date("2026-09-02T04:00:00.000Z"),
  expiresAt: new Date("2026-09-01T12:00:00.000Z"),
  demand: {
    matchMode: "selective" as const,
    budgetMinJpy: 10_000,
    budgetMaxJpy: 30_000
  }
};

const option = {
  scheduleSlotId: 91,
  shopId: 11,
  technicianProfileId: 81,
  technicianUserId: 8,
  serviceId: 501,
  technicianServiceId: null,
  serviceName: "ヘアセット",
  durationMinutes: 60,
  startsAt: serviceStartsAt,
  endsAt: serviceEndsAt
};

const matchingLock = {
  id: 51,
  status: "open" as const,
  version: 3,
  effectiveTargetProviderCount: 2,
  effectiveBudgetMaxJpy: 30_000
};

const createRepository = (overrides: Partial<ExchangeClaimRepositoryPort> = {}) => {
  const repository: ExchangeClaimRepositoryPort = {
    runInTransaction: jest.fn(async (handler) => handler(repository)),
    listOptions: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    findRequest: jest.fn(async () => request),
    findOptionCandidate: jest.fn(async () => ({ technicianProfileId: 81 })),
    lockRequest: jest.fn(async () => request),
    lockMatching: jest.fn(async () => matchingLock),
    advanceMatchingForClaimEvent: jest.fn(async () => true),
    lockTechnician: jest.fn(async () => true),
    lockActiveClaims: jest.fn(async () => []),
    lockTechnicians: jest.fn(async () => true),
    hasParticipantConflict: jest.fn(async () => false),
    hasBookingConflict: jest.fn(async () => false),
    notifyQuickBudgetDecisionRequired: jest.fn(async () => undefined),
    completeMatch: jest.fn(async () => null),
    lockOption: jest.fn(async () => option),
    hasActiveClaimForRequestTechnician: jest.fn(async () => false),
    hasOverlappingActiveClaim: jest.fn(async () => false),
    hasOverlappingMatchParticipant: jest.fn(async () => false),
    hasConflictingBooking: jest.fn(async () => false),
    findIdempotent: jest.fn(async () => null),
    findMine: jest.fn(async () => claim),
    findMineById: jest.fn(async () => claim),
    listReceived: jest.fn(async () => ({ list: [claim], total: 1, page: 1, page_size: 20 })),
    lockClaim: jest.fn(async () => ({
      id: 301,
      exchangePostId: 41,
      claimantIdentityId: 17,
      status: "active" as const,
      withdrawalIdempotencyKey: null,
      withdrawalPayloadFingerprint: null,
      claim
    })),
    create: jest.fn(async () => claim),
    withdraw: jest.fn(async () => ({
      ...claim,
      status: "withdrawn" as const,
      withdrawnAt: now.toISOString(),
      terminalAt: now.toISOString()
    })),
    createAudit: jest.fn(async () => undefined),
    ...overrides
  };
  return repository;
};

const requestContext = { ip: "127.0.0.1", userAgent: "jest" };

describe("ExchangeClaimService", () => {
  it("scopes merchant and technician option lists to their formal provider authority", async () => {
    const repository = createRepository();
    const actorResolver = {
      resolveActor: jest.fn(async (lookup: { identityId: number }) =>
        lookup.identityId === 17 ? merchantActor : technicianActor
      )
    };
    const service = new ExchangeClaimService(repository, actorResolver, () => now);

    await service.listOptions(merchantAccess, 41, { page: 1, page_size: 20 });
    await service.listOptions(technicianAccess, 41, {
      page: 1,
      page_size: 20,
      shop_id: 11
    });

    expect(repository.listOptions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        postId: 41,
        scope: { kind: "merchant", shopId: 11 },
        page: 1,
        pageSize: 20
      })
    );
    expect(repository.listOptions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        postId: 41,
        scope: { kind: "technician", technicianProfileId: 81 },
        shopId: 11
      })
    );
  });

  it("rejects option reads when the provider identity belongs to the Request author user", async () => {
    const repository = createRepository({
      findRequest: jest.fn(async () => ({ ...request, authorUserId: merchantActor.userId }))
    });
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );

    await expect(
      service.listOptions(merchantAccess, 41, { page: 1, page_size: 20 })
    ).rejects.toMatchObject({ code: 40311 });
    expect(repository.listOptions).not.toHaveBeenCalled();
  });

  it("creates a selective claim with request-technician-slot locks, soft conflict checks and audit", async () => {
    const events: string[] = [];
    const quickMatchingService = { attemptAfterClaim: jest.fn() };
    const repository = createRepository({
      lockRequest: jest.fn(async () => {
        events.push("lock-request");
        return request;
      }),
      lockMatching: jest.fn(async () => {
        events.push("lock-matching");
        return matchingLock;
      }),
      findOptionCandidate: jest.fn(async () => {
        events.push("read-option-candidate");
        return { technicianProfileId: 81 };
      }),
      lockTechnician: jest.fn(async () => {
        events.push("lock-technician");
        return true;
      }),
      lockOption: jest.fn(async () => {
        events.push("lock-slot");
        return option;
      }),
      hasActiveClaimForRequestTechnician: jest.fn(async () => {
        events.push("check-duplicate");
        return false;
      }),
      hasOverlappingActiveClaim: jest.fn(async () => {
        events.push("check-claim-conflict");
        return false;
      }),
      hasOverlappingMatchParticipant: jest.fn(async () => {
        events.push("check-match-conflict");
        return false;
      }),
      hasConflictingBooking: jest.fn(async () => {
        events.push("check-booking-conflict");
        return false;
      }),
      create: jest.fn(async (input) => {
        events.push("create");
        expect(input).toMatchObject({
          exchangePostId: 41,
          claimantUserId: 7,
          claimantIdentityId: 17,
          shopId: 11,
          technicianProfileId: 81,
          serviceId: 501,
          scheduleSlotId: 91,
          quoteAmountJpy: 15_000
        });
        return claim;
      }),
      advanceMatchingForClaimEvent: jest.fn(async () => {
        events.push("advance-matching");
        return true;
      }),
      createAudit: jest.fn(async () => {
        events.push("audit");
      })
    });
    const actorResolver = { resolveActor: jest.fn(async () => merchantActor) };
    const service = new ExchangeClaimService(
      repository,
      actorResolver,
      () => now,
      quickMatchingService
    );

    await expect(
      service.createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
        "claim-key-00000001",
        requestContext
      )
    ).resolves.toEqual(claim);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ source: "shop_dispatch", quoteAmountJpy: 15_000 }));
    expect(events).toEqual([
      "lock-request",
      "lock-matching",
      "read-option-candidate",
      "lock-technician",
      "lock-slot",
      "check-duplicate",
      "check-claim-conflict",
      "check-match-conflict",
      "check-booking-conflict",
      "create",
      "advance-matching",
      "audit"
    ]);
    expect(repository.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 7,
        action: "exchange.claim.create",
        targetType: "exchange_claim",
        targetId: 301
      })
    );
    expect(quickMatchingService.attemptAfterClaim).not.toHaveBeenCalled();
  });

  it("passes a dynamic option's service reference through the locked claim path", async () => {
    const repository = createRepository();
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );
    await service.createClaim(
      merchantAccess,
      41,
      { scheduleSlotId: -1048578, serviceRef: "shop:501", quoteAmountJpy: 15_000, message: null },
      "claim-key-dynamic-0001",
      requestContext
    );
    expect(repository.lockOption).toHaveBeenCalledWith(
      -1048578,
      { kind: "merchant", shopId: 11 },
      now,
      "shop:501"
    );
  });

  it("records a technician's manual or automatic claim source without accepting it from the public request body", async () => {
    const repository = createRepository();
    const service = new ExchangeClaimService(repository, { resolveActor: jest.fn(async () => technicianActor) }, () => now);
    const input = { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null };
    await service.createClaim(technicianAccess, 41, input, "claim-source-manual-0001", requestContext);
    expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ source: "manual", quoteAmountJpy: 15_000 }));
    await service.createClaim(technicianAccess, 41, input, "claim-source-auto-00001", requestContext, { source: "automatic", suppressQuickMatching: true });
    expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ source: "automatic", quoteAmountJpy: 15_000 }));
  });

  it("rejects a shop claim that selects the Request author's own technician profile", async () => {
    const repository = createRepository({
      lockOption: jest.fn(async () => ({ ...option, technicianUserId: request.authorUserId }))
    });
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );
    await expect(service.createClaim(
      merchantAccess, 41,
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "claim-key-self-technician-0001", requestContext
    )).rejects.toMatchObject({ code: 40311 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["expired request", { ...request, expiresAt: now }, 40979],
    ["owner self claim", { ...request, ownerIdentityId: 17 }, 40311],
    [
      "same user through another identity",
      { ...request, authorUserId: 7, ownerIdentityId: 99 },
      40311
    ]
  ])("rejects %s before creating", async (_label, lockedRequest, code) => {
    const repository = createRepository({
      lockRequest: jest.fn(async () => lockedRequest as ExchangeClaimRequestRecord)
    });
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );
    await expect(
      service.createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
        "claim-key-00000001",
        requestContext
      )
    ).rejects.toMatchObject({ code });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("invokes Quick matching after the claim event and returns the refreshed matched claim", async () => {
    const matchedClaim = { ...claim, status: "matched" as const, terminalAt: now.toISOString() };
    const quickMatchingService = {
      attemptAfterClaim: jest.fn(async () => ({ kind: "matched" as const, matching: null! }))
    };
    const repository = createRepository({
      lockRequest: jest.fn(async () => ({
        ...request,
        demand: { ...request.demand, matchMode: "quick" as const }
      })),
      findMineById: jest.fn(async () => matchedClaim)
    });
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now,
      quickMatchingService
    );

    await expect(
      service.createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
        "claim-quick-key-0001",
        requestContext
      )
    ).resolves.toEqual(matchedClaim);
    expect(quickMatchingService.attemptAfterClaim).toHaveBeenCalledWith(
      repository,
      expect.objectContaining({
        exchangePostId: 41,
        ownerUserId: 99,
        ownerIdentityId: 21,
        matching: expect.objectContaining({ id: 51, version: 4 }),
        triggeringClaimId: 301
      })
    );
  });

  it("keeps an automatically submitted Quick Request claim in the candidate pool", async () => {
    const quickMatchingService = { attemptAfterClaim: jest.fn() };
    const repository = createRepository({
      lockRequest: jest.fn(async () => ({
        ...request,
        demand: { ...request.demand, matchMode: "quick" as const }
      }))
    });
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now,
      quickMatchingService
    );

    await expect(service.createClaim(
      merchantAccess,
      41,
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "claim-auto-key-00001",
      requestContext,
      { suppressQuickMatching: true }
    )).resolves.toEqual(claim);
    expect(quickMatchingService.attemptAfterClaim).not.toHaveBeenCalled();
  });

  it.each([
    [9_999, 40973],
    [30_001, 40974]
  ])("rejects quote %s outside the publisher budget", async (quoteAmountJpy, code) => {
    const repository = createRepository();
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );
    await expect(
      service.createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy, message: null },
        "claim-key-00000001",
        requestContext
      )
    ).rejects.toMatchObject({ code });
  });

  it.each([
    ["missing candidate", { findOptionCandidate: jest.fn(async () => null) }, 40419],
    ["missing technician", { lockTechnician: jest.fn(async () => false) }, 40975],
    ["stale slot", { lockOption: jest.fn(async () => null) }, 40975],
    ["duplicate", { hasActiveClaimForRequestTechnician: jest.fn(async () => true) }, 40977],
    ["soft lock conflict", { hasOverlappingActiveClaim: jest.fn(async () => true) }, 40976],
    [
      "matched participant conflict",
      { hasOverlappingMatchParticipant: jest.fn(async () => true) },
      40976
    ],
    ["booking conflict", { hasConflictingBooking: jest.fn(async () => true) }, 40976]
  ])("rejects %s", async (_label, overrides, code) => {
    const repository = createRepository(overrides);
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );
    await expect(
      service.createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
        "claim-key-00000001",
        requestContext
      )
    ).rejects.toMatchObject({ code });
  });

  it("replays an identical idempotency key and rejects a changed payload", async () => {
    const baseRepository = createRepository();
    const actorResolver = { resolveActor: jest.fn(async () => merchantActor) };
    const service = new ExchangeClaimService(baseRepository, actorResolver, () => now);
    await service.createClaim(
      merchantAccess,
      41,
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "claim-key-00000001",
      requestContext
    );
    const createInput = (baseRepository.create as jest.Mock).mock.calls[0]?.[0] as {
      payloadFingerprint: string;
    };
    const replayRepository = createRepository({
      findIdempotent: jest.fn(async () => ({
        claim,
        fingerprint: createInput.payloadFingerprint
      }))
    });
    const replayService = new ExchangeClaimService(replayRepository, actorResolver, () => now);
    await expect(
      replayService.createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
        "claim-key-00000001",
        requestContext
      )
    ).resolves.toEqual(claim);
    const conflictRepository = createRepository({
      findIdempotent: jest.fn(async () => ({ claim, fingerprint: "b".repeat(64) }))
    });
    await expect(
      new ExchangeClaimService(conflictRepository, actorResolver, () => now).createClaim(
        merchantAccess,
        41,
        { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
        "claim-key-00000001",
        requestContext
      )
    ).rejects.toMatchObject({ code: 40978 });
  });

  it("allows only the claimant identity to read and withdraw its active pre-match claim", async () => {
    const events: string[] = [];
    const repository = createRepository({
      lockRequest: jest.fn(async () => {
        events.push("lock-request");
        return request;
      }),
      lockMatching: jest.fn(async () => {
        events.push("lock-matching");
        return matchingLock;
      }),
      lockClaim: jest.fn(async () => {
        events.push("lock-claim");
        return {
          id: 301,
          exchangePostId: 41,
          claimantIdentityId: 17,
          status: "active" as const,
          withdrawalIdempotencyKey: null,
          withdrawalPayloadFingerprint: null,
          claim
        };
      }),
      withdraw: jest.fn(async () => {
        events.push("withdraw");
        return {
          ...claim,
          status: "withdrawn" as const,
          withdrawnAt: now.toISOString(),
          terminalAt: now.toISOString()
        };
      }),
      advanceMatchingForClaimEvent: jest.fn(async () => {
        events.push("advance-matching");
        return true;
      }),
      createAudit: jest.fn(async () => {
        events.push("audit");
      })
    });
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => merchantActor) },
      () => now
    );

    await expect(service.getMine(merchantAccess, 41)).resolves.toEqual(claim);
    await expect(
      service.withdrawClaim(merchantAccess, 301, "claim-withdraw-key-0001", requestContext)
    ).resolves.toMatchObject({ id: 301, status: "withdrawn" });
    expect(events).toEqual([
      "lock-request",
      "lock-matching",
      "lock-claim",
      "withdraw",
      "advance-matching",
      "audit"
    ]);
    expect(repository.withdraw).toHaveBeenCalledWith(
      301,
      17,
      now,
      "claim-withdraw-key-0001",
      expect.stringMatching(/^[a-f0-9]{64}$/u)
    );
  });

  it("replays an identical withdrawal key without repeating mutation or audit", async () => {
    const withdrawnClaim = {
      ...claim,
      status: "withdrawn" as const,
      withdrawnAt: now.toISOString(),
      terminalAt: now.toISOString()
    };
    const firstRepository = createRepository();
    const actorResolver = { resolveActor: jest.fn(async () => merchantActor) };
    const firstService = new ExchangeClaimService(firstRepository, actorResolver, () => now);
    await firstService.withdrawClaim(
      merchantAccess,
      301,
      "claim-withdraw-key-0002",
      requestContext
    );
    const fingerprint = (firstRepository.withdraw as jest.Mock).mock.calls[0]?.[4] as string;
    const replayRepository = createRepository({
      findMineById: jest.fn(async () => withdrawnClaim),
      lockClaim: jest.fn(async () => ({
        id: 301,
        exchangePostId: 41,
        claimantIdentityId: 17,
        status: "withdrawn" as const,
        withdrawalIdempotencyKey: "claim-withdraw-key-0002",
        withdrawalPayloadFingerprint: fingerprint,
        claim: withdrawnClaim
      }))
    });

    await expect(
      new ExchangeClaimService(replayRepository, actorResolver, () => now).withdrawClaim(
        merchantAccess,
        301,
        "claim-withdraw-key-0002",
        requestContext
      )
    ).resolves.toEqual(withdrawnClaim);
    expect(replayRepository.withdraw).not.toHaveBeenCalled();
    expect(replayRepository.createAudit).not.toHaveBeenCalled();
  });

  it("lists claims only through the request owner identity scope", async () => {
    const repository = createRepository();
    const service = new ExchangeClaimService(
      repository,
      { resolveActor: jest.fn(async () => ({ ...merchantActor, identityId: 21 })) },
      () => now
    );
    await service.listReceived({ ...merchantAccess, currentIdentityId: 21 }, 41, {
      page: 1,
      page_size: 20
    });
    expect(repository.listReceived).toHaveBeenCalledWith(41, 21, {
      page: 1,
      pageSize: 20
    });
  });
});
